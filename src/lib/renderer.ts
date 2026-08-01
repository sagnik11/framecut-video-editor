import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import type { EditorSettings } from "../types";
import { even } from "./format";
import { buildMediaCommand } from "./media-command";

const WASM_URL = "/api/runtime/ffmpeg-core-0.12.10.wasm";

export type RenderSource = {
  source: File | Blob | string;
  name: string;
  duration: number;
  width: number;
  height: number;
};

function extensionFor(name: string): string {
  return name.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] ?? ".mp4";
}

function normalizeCommand(
  inputName: string,
  outputName: string,
  source: RenderSource,
  width: number,
  height: number,
  hasAudio: boolean,
): string[] {
  const args = ["-i", inputName];
  if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  args.push(
    "-map", "0:v:0",
    "-map", hasAudio ? "0:a:0" : "1:a:0",
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1`,
    "-t", Math.max(0.1, source.duration).toFixed(3),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    outputName,
  );
  return args;
}

class BrowserRenderer {
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<void> | null = null;
  private onProgress: ((progress: number) => void) | null = null;
  private progressStart = 0;
  private progressSpan = 100;

  async load(onLoadProgress?: (message: string) => void): Promise<void> {
    if (this.ffmpeg?.loaded) return;
    if (this.loading) return await this.loading;

    const ffmpeg = new FFmpeg();
    this.ffmpeg = ffmpeg;
    ffmpeg.on("progress", ({ progress }) => {
      const local = Math.max(0, Math.min(1, progress));
      this.onProgress?.(Math.round(this.progressStart + local * this.progressSpan));
    });

    this.loading = (async () => {
      onLoadProgress?.("Loading the browser video engine (about 31 MB)...");
      await ffmpeg.load({ coreURL, wasmURL: WASM_URL });
      onLoadProgress?.("Video engine ready.");
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private setProgressRange(start: number, span: number): void {
    this.progressStart = start;
    this.progressSpan = span;
  }

  private async hasAudio(inputName: string, index: number): Promise<boolean> {
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) return false;
    const output = `probe-${index}.txt`;
    try {
      const code = await ffmpeg.ffprobe([
        "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index",
        "-of", "csv=p=0", inputName, "-o", output,
      ]);
      if (code !== 0) return false;
      const result = await ffmpeg.readFile(output, "utf8");
      return typeof result === "string" && result.trim().length > 0;
    } finally {
      await ffmpeg.deleteFile(output).catch(() => undefined);
    }
  }

  async render(
    sources: RenderSource[],
    settings: EditorSettings,
    onProgress: (progress: number) => void,
    onStatus: (message: string) => void,
  ): Promise<Blob> {
    if (sources.length === 0) throw new Error("Add a video before exporting.");
    await this.load(onStatus);
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) throw new Error("The video engine did not initialize.");

    this.onProgress = onProgress;
    const inputNames: string[] = [];
    const temporaryNames: string[] = [];
    const outputName = "framecut-export.mp4";

    try {
      onStatus(sources.length > 1 ? `Preparing ${sources.length} timeline clips...` : "Preparing source video...");
      for (let index = 0; index < sources.length; index += 1) {
        const inputName = `input-${index}${extensionFor(sources[index].name)}`;
        inputNames.push(inputName);
        await ffmpeg.writeFile(inputName, await fetchFile(sources[index].source));
        onProgress(Math.round(((index + 1) / sources.length) * 8));
      }

      let renderInput = inputNames[0];
      if (sources.length > 1) {
        const width = even(sources[0].width || 1920);
        const height = even(sources[0].height || 1080);
        const normalizeSpan = 42 / sources.length;
        for (let index = 0; index < sources.length; index += 1) {
          onStatus(`Matching clip ${index + 1} of ${sources.length} to the timeline...`);
          const normalized = `normalized-${index}.mp4`;
          temporaryNames.push(normalized);
          const hasAudio = await this.hasAudio(inputNames[index], index);
          this.setProgressRange(8 + index * normalizeSpan, normalizeSpan);
          const code = await ffmpeg.exec(normalizeCommand(inputNames[index], normalized, sources[index], width, height, hasAudio));
          if (code !== 0) throw new Error(`Clip ${index + 1} could not be prepared.`);
        }

        const concatList = "concat.txt";
        const sequenceName = "timeline-sequence.mp4";
        temporaryNames.push(concatList, sequenceName);
        await ffmpeg.writeFile(concatList, new TextEncoder().encode(
          temporaryNames.filter((name) => name.startsWith("normalized-")).map((name) => `file '${name}'`).join("\n"),
        ));
        onStatus("Joining timeline clips...");
        this.setProgressRange(50, 8);
        const concatCode = await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", sequenceName]);
        if (concatCode !== 0) throw new Error("The timeline clips could not be joined.");
        renderInput = sequenceName;
      }

      onStatus("Rendering your timeline in the browser...");
      this.setProgressRange(sources.length > 1 ? 58 : 8, sources.length > 1 ? 42 : 92);
      const exitCode = await ffmpeg.exec(buildMediaCommand({ inputName: renderInput, outputName, settings }));
      if (exitCode !== 0) throw new Error(`The renderer exited with code ${exitCode}.`);
      const data = await ffmpeg.readFile(outputName);
      if (typeof data === "string") throw new Error("The renderer returned an unexpected text result.");
      onProgress(100);
      return new Blob([data.slice().buffer], { type: "video/mp4" });
    } finally {
      this.onProgress = null;
      this.setProgressRange(0, 100);
      await Promise.all([...inputNames, ...temporaryNames, outputName].map((name) => ffmpeg.deleteFile(name).catch(() => undefined)));
    }
  }

  cancel(): void {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loading = null;
    this.onProgress = null;
  }
}

export const browserRenderer = new BrowserRenderer();

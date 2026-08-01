import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import type { EditorSettings } from "../types";
import { buildMediaCommand } from "./media-command";

const WASM_URL = "/api/runtime/ffmpeg-core-0.12.10.wasm";

class BrowserRenderer {
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<void> | null = null;
  private onProgress: ((progress: number) => void) | null = null;

  async load(onLoadProgress?: (message: string) => void): Promise<void> {
    if (this.ffmpeg?.loaded) return;
    if (this.loading) return await this.loading;

    const ffmpeg = new FFmpeg();
    this.ffmpeg = ffmpeg;
    ffmpeg.on("progress", ({ progress }) => {
      this.onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))));
    });

    this.loading = (async () => {
      onLoadProgress?.("Loading the browser video engine (about 31 MB)...");
      await ffmpeg.load({
        coreURL,
        wasmURL: WASM_URL,
      });
      onLoadProgress?.("Video engine ready.");
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async render(
    source: File | Blob | string,
    sourceName: string,
    settings: EditorSettings,
    onProgress: (progress: number) => void,
    onStatus: (message: string) => void,
  ): Promise<Blob> {
    await this.load(onStatus);
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) throw new Error("The video engine did not initialize.");

    this.onProgress = onProgress;
    const extension = sourceName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] ?? ".mp4";
    const inputName = `input${extension}`;
    const outputName = "framecut-export.mp4";

    onStatus("Preparing source video...");
    await ffmpeg.writeFile(inputName, await fetchFile(source));

    try {
      onStatus("Rendering in your browser...");
      const exitCode = await ffmpeg.exec(buildMediaCommand({ inputName, outputName, settings }));
      if (exitCode !== 0) throw new Error(`The renderer exited with code ${exitCode}.`);
      const data = await ffmpeg.readFile(outputName);
      if (typeof data === "string") throw new Error("The renderer returned an unexpected text result.");
      onProgress(100);
      return new Blob([data.slice().buffer], { type: "video/mp4" });
    } finally {
      this.onProgress = null;
      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      await ffmpeg.deleteFile(outputName).catch(() => undefined);
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

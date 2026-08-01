import type { EditorSettings } from "../types";
import { even } from "./format";

type BuildCommandOptions = {
  inputName: string;
  outputName: string;
  settings: EditorSettings;
};

export function qualityToCrf(quality: number): number {
  const clamped = Math.max(0, Math.min(100, quality));
  return Math.round(34 - clamped * 0.18);
}

export function buildMediaCommand({ inputName, outputName, settings }: BuildCommandOptions): string[] {
  const duration = Math.max(0.1, settings.trim.end - settings.trim.start);
  const filters: string[] = [];

  if (settings.crop.enabled) {
    const width = even(settings.crop.width);
    const height = even(settings.crop.height);
    const x = Math.max(0, even(settings.crop.x));
    const y = Math.max(0, even(settings.crop.y));
    filters.push(`crop=${width}:${height}:${x}:${y}`);
  }

  if (settings.resize.enabled) {
    const width = even(settings.resize.width);
    const height = even(settings.resize.height);
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);
  }

  if (settings.stopMotion.enabled) {
    const fps = Math.max(1, Math.min(24, Math.round(settings.stopMotion.fps)));
    filters.push(`fps=${fps}`);
    filters.push("fps=30");
  }

  const args = [
    "-i", inputName,
    "-ss", settings.trim.start.toFixed(3),
    "-t", duration.toFixed(3),
    "-map", "0:v:0",
    "-map", "0:a:0?",
  ];

  if (filters.length > 0) args.push("-vf", filters.join(","));

  args.push(
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", String(qualityToCrf(settings.compression.quality)),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputName,
  );

  return args;
}

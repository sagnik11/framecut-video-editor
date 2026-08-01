import { normalizeSplitPoints } from "./lib/video-split";

export type CropSettings = {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: "free" | "16:9" | "9:16" | "1:1" | "4:5";
};

export type EditorSettings = {
  trim: { start: number; end: number };
  split: { points: number[] };
  stopMotion: { enabled: boolean; fps: number };
  compression: { quality: number };
  resize: { enabled: boolean; width: number; height: number };
  crop: CropSettings;
};

export type ProjectClip = {
  id: string;
  name: string;
  type: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  position: number;
};

export type Project = {
  id: string;
  name: string;
  status: "draft" | "ready" | "exported";
  sourceReady: boolean;
  exportReady: boolean;
  sourceName: string | null;
  sourceType: string | null;
  sourceSize: number | null;
  clips: ProjectClip[];
  duration: number | null;
  width: number | null;
  height: number | null;
  settings: Partial<EditorSettings>;
  createdAt: string;
  updatedAt: string;
};

export type SourceMetadata = {
  duration: number;
  width: number;
  height: number;
};

export function defaultEditorSettings(duration = 0, width = 1920, height = 1080): EditorSettings {
  return {
    trim: { start: 0, end: duration },
    split: { points: [] },
    stopMotion: { enabled: false, fps: 4 },
    compression: { quality: 72 },
    resize: { enabled: false, width, height },
    crop: { enabled: false, x: 0, y: 0, width, height, aspect: "free" },
  };
}

export function normalizeSettings(
  value: Partial<EditorSettings> | undefined,
  duration: number,
  width: number,
  height: number,
): EditorSettings {
  const defaults = defaultEditorSettings(duration, width, height);
  const trim = { ...defaults.trim, ...value?.trim };
  const crop = { ...defaults.crop, ...value?.crop };
  const resize = { ...defaults.resize, ...value?.resize };
  const safeStart = Math.max(0, Math.min(trim.start, duration));
  const safeEnd = Math.max(safeStart, Math.min(trim.end || duration, duration));
  const safeX = Math.max(0, Math.min(crop.x, width - 2));
  const safeY = Math.max(0, Math.min(crop.y, height - 2));

  return {
    trim: {
      start: safeStart,
      end: safeEnd,
    },
    split: {
      points: normalizeSplitPoints(value?.split?.points, safeStart, safeEnd),
    },
    stopMotion: {
      enabled: value?.stopMotion?.enabled ?? defaults.stopMotion.enabled,
      fps: Math.max(1, Math.min(24, Math.round(value?.stopMotion?.fps ?? defaults.stopMotion.fps))),
    },
    compression: {
      quality: Math.max(0, Math.min(100, value?.compression?.quality ?? defaults.compression.quality)),
    },
    resize: {
      enabled: resize.enabled,
      width: Math.max(2, Math.min(8192, Math.round(resize.width / 2) * 2)),
      height: Math.max(2, Math.min(8192, Math.round(resize.height / 2) * 2)),
    },
    crop: {
      ...crop,
      x: safeX,
      y: safeY,
      width: Math.max(2, Math.min(crop.width, width - safeX)),
      height: Math.max(2, Math.min(crop.height, height - safeY)),
    },
  };
}

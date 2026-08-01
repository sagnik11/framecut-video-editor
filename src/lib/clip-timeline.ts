import type { ProjectClip } from "../types";

export type TimelineClip = ProjectClip & { start: number; end: number };

export function buildClipTimeline(clips: ProjectClip[]): TimelineClip[] {
  let cursor = 0;
  return [...clips]
    .sort((a, b) => a.position - b.position)
    .map((clip) => {
      const start = cursor;
      cursor += Math.max(0, clip.duration);
      return { ...clip, start, end: cursor };
    });
}

export function findTimelineClipIndex(clips: TimelineClip[], time: number): number {
  if (clips.length === 0) return 0;
  const bounded = Math.max(0, time);
  const found = clips.findIndex((clip, index) => bounded < clip.end || index === clips.length - 1);
  return found < 0 ? clips.length - 1 : found;
}

export function clipLocalTime(clip: TimelineClip, timelineTime: number): number {
  return Math.max(0, Math.min(clip.duration, timelineTime - clip.start));
}

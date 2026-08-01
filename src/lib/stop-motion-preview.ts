export function normalizePreviewFps(fps: number): number {
  return Math.max(1, Math.min(24, Math.round(fps)));
}

export function getStopMotionFrameIndex(currentTime: number, trimStart: number, fps: number): number {
  const cadence = normalizePreviewFps(fps);
  const relativeTime = Math.max(0, currentTime - trimStart);
  return Math.floor((relativeTime + Number.EPSILON) * cadence);
}

export function getStopMotionFrameTime(currentTime: number, trimStart: number, fps: number): number {
  return trimStart + getStopMotionFrameIndex(currentTime, trimStart, fps) / normalizePreviewFps(fps);
}

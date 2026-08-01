export const MIN_SEGMENT_DURATION = 0.1;

export type VideoSegment = {
  index: number;
  start: number;
  end: number;
  duration: number;
};

function roundTime(time: number): number {
  return Math.round(time * 1000) / 1000;
}

export function normalizeSplitPoints(
  points: number[] | undefined,
  trimStart: number,
  trimEnd: number,
): number[] {
  if (!points?.length || trimEnd - trimStart < MIN_SEGMENT_DURATION * 2) return [];

  const sorted = points
    .filter(Number.isFinite)
    .map(roundTime)
    .filter((point) => point - trimStart >= MIN_SEGMENT_DURATION && trimEnd - point >= MIN_SEGMENT_DURATION)
    .sort((a, b) => a - b);

  const normalized: number[] = [];
  for (const point of sorted) {
    const previous = normalized.at(-1) ?? trimStart;
    if (point - previous >= MIN_SEGMENT_DURATION) normalized.push(point);
  }

  while (normalized.length > 0 && trimEnd - normalized[normalized.length - 1] < MIN_SEGMENT_DURATION) {
    normalized.pop();
  }

  return normalized;
}

export function getVideoSegments(
  trimStart: number,
  trimEnd: number,
  points: number[] | undefined,
): VideoSegment[] {
  const boundaries = [trimStart, ...normalizeSplitPoints(points, trimStart, trimEnd), trimEnd];
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return { index, start, end, duration: Math.max(0, end - start) };
  });
}

export function getSegmentIndexAtTime(segments: VideoSegment[], time: number): number {
  if (segments.length === 0) return 0;
  const index = segments.findIndex((segment, segmentIndex) => (
    time >= segment.start && (time < segment.end || segmentIndex === segments.length - 1)
  ));
  if (index >= 0) return index;
  return time < segments[0].start ? 0 : segments.length - 1;
}


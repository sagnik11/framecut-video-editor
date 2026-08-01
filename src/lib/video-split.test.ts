import { describe, expect, it } from "vitest";
import { getSegmentIndexAtTime, getVideoSegments, normalizeSplitPoints } from "./video-split";

describe("video split helpers", () => {
  it("sorts, deduplicates, and constrains split points to the trim range", () => {
    expect(normalizeSplitPoints([8, 2, 2, -1, 9.95, Number.NaN], 1, 10)).toEqual([2, 8]);
  });

  it("creates contiguous segments without changing the trimmed duration", () => {
    const segments = getVideoSegments(1, 10, [3, 7]);
    expect(segments).toEqual([
      { index: 0, start: 1, end: 3, duration: 2 },
      { index: 1, start: 3, end: 7, duration: 4 },
      { index: 2, start: 7, end: 10, duration: 3 },
    ]);
    expect(segments.reduce((total, segment) => total + segment.duration, 0)).toBe(9);
  });

  it("selects the segment on the right side of a split boundary", () => {
    const segments = getVideoSegments(0, 12, [4, 8]);
    expect(getSegmentIndexAtTime(segments, 3.99)).toBe(0);
    expect(getSegmentIndexAtTime(segments, 4)).toBe(1);
    expect(getSegmentIndexAtTime(segments, 12)).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import type { ProjectClip } from "../types";
import { buildClipTimeline, clipLocalTime, findTimelineClipIndex } from "./clip-timeline";

const clips: ProjectClip[] = [
  { id: "b", name: "B", type: "video/mp4", size: 2, duration: 3, width: 100, height: 100, position: 1 },
  { id: "source", name: "A", type: "video/mp4", size: 1, duration: 2, width: 100, height: 100, position: 0 },
];

describe("clip timeline", () => {
  it("orders clips and assigns cumulative ranges", () => {
    expect(buildClipTimeline(clips)).toMatchObject([
      { id: "source", start: 0, end: 2 },
      { id: "b", start: 2, end: 5 },
    ]);
  });

  it("selects a clip at boundaries and converts to local time", () => {
    const timeline = buildClipTimeline(clips);
    expect(findTimelineClipIndex(timeline, 1.99)).toBe(0);
    expect(findTimelineClipIndex(timeline, 2)).toBe(1);
    expect(findTimelineClipIndex(timeline, 99)).toBe(1);
    expect(clipLocalTime(timeline[1], 4.25)).toBe(2.25);
  });
});

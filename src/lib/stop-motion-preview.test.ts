import { describe, expect, it } from "vitest";
import { getStopMotionFrameIndex, getStopMotionFrameTime, normalizePreviewFps } from "./stop-motion-preview";

describe("stop-motion preview cadence", () => {
  it("holds each frame for 250ms at 4 fps", () => {
    expect(getStopMotionFrameIndex(0, 0, 4)).toBe(0);
    expect(getStopMotionFrameIndex(0.249, 0, 4)).toBe(0);
    expect(getStopMotionFrameIndex(0.25, 0, 4)).toBe(1);
    expect(getStopMotionFrameIndex(0.499, 0, 4)).toBe(1);
    expect(getStopMotionFrameIndex(0.5, 0, 4)).toBe(2);
  });

  it("anchors sampling to the trim start", () => {
    expect(getStopMotionFrameTime(2.24, 2, 4)).toBe(2);
    expect(getStopMotionFrameTime(2.25, 2, 4)).toBe(2.25);
    expect(getStopMotionFrameTime(2.74, 2, 4)).toBe(2.5);
  });

  it("clamps preview cadence to the supported range", () => {
    expect(normalizePreviewFps(0)).toBe(1);
    expect(normalizePreviewFps(4.4)).toBe(4);
    expect(normalizePreviewFps(60)).toBe(24);
  });
});

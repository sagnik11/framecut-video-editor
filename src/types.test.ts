import { describe, expect, it } from "vitest";
import { normalizeSettings } from "./types";

describe("normalizeSettings", () => {
  it("constrains persisted editor values to render-safe bounds", () => {
    const settings = normalizeSettings({
      trim: { start: 99, end: 120 },
      stopMotion: { enabled: true, fps: 80 },
      compression: { quality: -10 },
      resize: { enabled: true, width: 8191, height: 9001 },
      crop: { enabled: true, aspect: "free", x: 639, y: 359, width: 640, height: 360 },
    }, 4, 640, 360);

    expect(settings.trim).toEqual({ start: 4, end: 4 });
    expect(settings.stopMotion.fps).toBe(24);
    expect(settings.compression.quality).toBe(0);
    expect(settings.resize).toEqual({ enabled: true, width: 8192, height: 8192 });
    expect(settings.crop).toMatchObject({ x: 638, y: 358, width: 2, height: 2 });
  });
});

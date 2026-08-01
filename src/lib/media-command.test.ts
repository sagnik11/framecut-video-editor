import { describe, expect, it } from "vitest";
import { defaultEditorSettings } from "../types";
import { buildMediaCommand, qualityToCrf } from "./media-command";

describe("media command", () => {
  it("builds a stop-motion, crop, resize, and compression command", () => {
    const settings = defaultEditorSettings(12, 1920, 1080);
    settings.trim = { start: 1.5, end: 9.5 };
    settings.stopMotion = { enabled: true, fps: 4 };
    settings.crop = { enabled: true, x: 10, y: 20, width: 1000, height: 800, aspect: "free" };
    settings.resize = { enabled: true, width: 720, height: 720 };

    const command = buildMediaCommand({ inputName: "input.mov", outputName: "output.mp4", settings });
    const filter = command[command.indexOf("-vf") + 1];

    expect(filter).toContain("crop=1000:800:10:20");
    expect(filter).toContain("scale=720:720");
    expect(filter).toContain("fps=4,fps=30");
    expect(command).toContain("8.000");
    expect(command.at(-1)).toBe("output.mp4");
  });

  it("maps higher quality to a lower CRF", () => {
    expect(qualityToCrf(90)).toBeLessThan(qualityToCrf(30));
    expect(qualityToCrf(200)).toBe(16);
    expect(qualityToCrf(-20)).toBe(34);
  });
});

import { describe, expect, it } from "vitest";
import type { CropSettings } from "../types";
import { moveCrop, resizeCrop } from "./crop-interaction";

const freeCrop: CropSettings = {
  enabled: true,
  x: 100,
  y: 100,
  width: 300,
  height: 200,
  aspect: "free",
};

describe("crop interactions", () => {
  it("moves the crop without letting it leave the source", () => {
    expect(moveCrop(freeCrop, 900, -200, 1000, 800)).toMatchObject({ x: 700, y: 0 });
  });

  it("resizes a free crop from the selected corner", () => {
    expect(resizeCrop(freeCrop, "nw", -50, 25, 1000, 800)).toMatchObject({
      x: 50,
      y: 125,
      width: 350,
      height: 175,
    });
  });

  it("preserves a preset aspect ratio while resizing", () => {
    const crop: CropSettings = { ...freeCrop, width: 320, height: 180, aspect: "16:9" };
    const resized = resizeCrop(crop, "se", 160, 10, 1000, 800);

    expect(resized.x).toBe(100);
    expect(resized.y).toBe(100);
    expect(resized.width).toBe(480);
    expect(resized.height).toBe(270);
    expect(resized.width / resized.height).toBeCloseTo(16 / 9);
  });
});

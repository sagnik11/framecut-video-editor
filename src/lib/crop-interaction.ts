import type { CropSettings } from "../types";

export type CropHandle = "nw" | "ne" | "se" | "sw";

const minimumCropSize = 2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function moveCrop(
  crop: CropSettings,
  deltaX: number,
  deltaY: number,
  sourceWidth: number,
  sourceHeight: number,
): CropSettings {
  return {
    ...crop,
    x: clamp(crop.x + deltaX, 0, Math.max(0, sourceWidth - crop.width)),
    y: clamp(crop.y + deltaY, 0, Math.max(0, sourceHeight - crop.height)),
  };
}

export function resizeCrop(
  crop: CropSettings,
  handle: CropHandle,
  deltaX: number,
  deltaY: number,
  sourceWidth: number,
  sourceHeight: number,
): CropSettings {
  const movesLeft = handle === "nw" || handle === "sw";
  const movesTop = handle === "nw" || handle === "ne";

  if (crop.aspect === "free") {
    const originalRight = crop.x + crop.width;
    const originalBottom = crop.y + crop.height;
    const left = movesLeft
      ? clamp(crop.x + deltaX, 0, originalRight - minimumCropSize)
      : crop.x;
    const right = movesLeft
      ? originalRight
      : clamp(originalRight + deltaX, crop.x + minimumCropSize, sourceWidth);
    const top = movesTop
      ? clamp(crop.y + deltaY, 0, originalBottom - minimumCropSize)
      : crop.y;
    const bottom = movesTop
      ? originalBottom
      : clamp(originalBottom + deltaY, crop.y + minimumCropSize, sourceHeight);

    return { ...crop, x: left, y: top, width: right - left, height: bottom - top };
  }

  const horizontalScale = movesLeft
    ? (crop.width - deltaX) / crop.width
    : (crop.width + deltaX) / crop.width;
  const verticalScale = movesTop
    ? (crop.height - deltaY) / crop.height
    : (crop.height + deltaY) / crop.height;
  const proposedScale = Math.abs(horizontalScale - 1) >= Math.abs(verticalScale - 1)
    ? horizontalScale
    : verticalScale;
  const anchorX = movesLeft ? crop.x + crop.width : crop.x;
  const anchorY = movesTop ? crop.y + crop.height : crop.y;
  const maximumWidth = movesLeft ? anchorX : sourceWidth - anchorX;
  const maximumHeight = movesTop ? anchorY : sourceHeight - anchorY;
  const minimumScale = Math.max(minimumCropSize / crop.width, minimumCropSize / crop.height);
  const maximumScale = Math.min(maximumWidth / crop.width, maximumHeight / crop.height);
  const scale = clamp(proposedScale, minimumScale, maximumScale);
  const width = crop.width * scale;
  const height = crop.height * scale;

  return {
    ...crop,
    x: movesLeft ? anchorX - width : anchorX,
    y: movesTop ? anchorY - height : anchorY,
    width,
    height,
  };
}

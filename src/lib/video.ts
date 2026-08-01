import type { SourceMetadata } from "../types";

function waitForEvent(target: HTMLMediaElement, event: "loadedmetadata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not decode this video."));
    };
    const cleanup = () => {
      target.removeEventListener(event, onSuccess);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(event, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

export async function readVideoMetadata(source: string | Blob): Promise<SourceMetadata> {
  const video = document.createElement("video");
  const ownedUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
  video.preload = "metadata";
  video.muted = true;
  video.src = ownedUrl ?? (typeof source === "string" ? source : "");

  try {
    await waitForEvent(video, "loadedmetadata");
    return {
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  }
}

export async function createVideoThumbnails(source: string, duration: number, count = 12): Promise<string[]> {
  if (!source || !duration) return [];
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = source;
  await waitForEvent(video, "loadedmetadata");

  const canvas = document.createElement("canvas");
  const ratio = video.videoWidth / Math.max(1, video.videoHeight);
  canvas.width = 180;
  canvas.height = Math.max(90, Math.round(canvas.width / ratio));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return [];

  const images: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = Math.min(duration - 0.04, (duration * index) / Math.max(1, count - 1));
    video.currentTime = Math.max(0, time);
    await waitForEvent(video, "seeked");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    images.push(canvas.toDataURL("image/jpeg", 0.68));
  }

  video.removeAttribute("src");
  video.load();
  return images;
}

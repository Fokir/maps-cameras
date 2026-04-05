// web/src/modules/stream/hooks/useScreenshot.ts
import { useCallback, useEffect, useState } from "react";
import { buildFilename } from "../lib/filename";
import { copyImageToClipboard, downloadBlob, hasClipboardImageSupport } from "../lib/fileSaver";

export interface ScreenshotApi {
  saveToFile(): Promise<void>;
  copyToClipboard(): Promise<void>;
  canCopy: boolean;
  isReady: boolean;
}

async function captureFrame(videoEl: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("canvas.toBlob returned null");
  return blob;
}

export function useScreenshot(videoEl: HTMLVideoElement | null, cameraName: string): ScreenshotApi {
  const [isReady, setIsReady] = useState(false);
  const canCopy = hasClipboardImageSupport();

  useEffect(() => {
    if (!videoEl) {
      setIsReady(false);
      return;
    }
    const update = () => setIsReady(videoEl.readyState >= 2 && videoEl.videoWidth > 0);
    update();
    videoEl.addEventListener("loadeddata", update);
    videoEl.addEventListener("emptied", update);
    return () => {
      videoEl.removeEventListener("loadeddata", update);
      videoEl.removeEventListener("emptied", update);
    };
  }, [videoEl]);

  const saveToFile = useCallback(async () => {
    if (!videoEl || !isReady) return;
    const blob = await captureFrame(videoEl);
    const filename = buildFilename(cameraName, "png");
    await downloadBlob(blob, filename);
  }, [videoEl, isReady, cameraName]);

  const copyToClipboard = useCallback(async () => {
    if (!videoEl || !isReady) return;
    const blob = await captureFrame(videoEl);
    await copyImageToClipboard(blob);
  }, [videoEl, isReady]);

  return { saveToFile, copyToClipboard, canCopy, isReady };
}

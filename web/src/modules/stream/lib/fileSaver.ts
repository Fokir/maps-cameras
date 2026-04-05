// web/src/modules/stream/lib/fileSaver.ts

type PickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

// Minimal type shims — File System Access API is not yet in lib.dom for all TS versions.
interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  types?: PickerAcceptType[];
}

interface FileSystemWritableFileStreamLike {
  write(data: BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (
      options?: ShowSaveFilePickerOptions
    ) => Promise<FileSystemFileHandleLike>;
  }
}

function hasSavePicker(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

function mimeFromFilename(filename: string): string {
  if (filename.endsWith(".mp4")) return "video/mp4";
  if (filename.endsWith(".webm")) return "video/webm";
  if (filename.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

/**
 * Saves a blob to disk. Uses File System Access API if available (native save dialog),
 * otherwise falls back to an anchor download into the browser's default downloads folder.
 * If the user cancels the native dialog, resolves silently without throwing.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (hasSavePicker()) {
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        types: [
          {
            description: "Video/Image file",
            accept: { [mimeFromFilename(filename)]: [`.${filename.split(".").pop()}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // AbortError = user cancelled. Resolve silently.
      if ((err as DOMException)?.name === "AbortError") return;
      // Fall through to anchor fallback on other errors.
      console.warn("showSaveFilePicker failed, falling back to anchor download:", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens a writable stream for direct-to-disk writing during long recordings.
 * Returns null if the File System Access API is not available.
 * Caller must close() the stream when done.
 */
export async function openWritableStream(
  filename: string
): Promise<FileSystemWritableFileStreamLike | null> {
  if (!hasSavePicker()) return null;
  try {
    const handle = await window.showSaveFilePicker!({
      suggestedName: filename,
      types: [
        {
          description: "Video recording",
          accept: { [mimeFromFilename(filename)]: [`.${filename.split(".").pop()}`] },
        },
      ],
    });
    return await handle.createWritable();
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return null;
    console.warn("openWritableStream failed:", err);
    return null;
  }
}

export function hasClipboardImageSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

/**
 * Copies an image blob to the system clipboard. Throws if the Clipboard API
 * is unavailable or permission is denied.
 */
export async function copyImageToClipboard(blob: Blob): Promise<void> {
  if (!hasClipboardImageSupport()) {
    throw new Error("Clipboard image API not available (needs HTTPS or localhost)");
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

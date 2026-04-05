// web/src/modules/stream/lib/mimeType.ts

export interface RecordingMimeType {
  mimeType: string;
  ext: "mp4" | "webm";
}

/**
 * Returns the first MediaRecorder-supported video mime type from a
 * preference-ordered list, or null if the browser cannot record any of them.
 */
export function pickRecordingMimeType(): RecordingMimeType | null {
  if (typeof MediaRecorder === "undefined") return null;

  const candidates: RecordingMimeType[] = [
    { mimeType: "video/mp4;codecs=avc1", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];

  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

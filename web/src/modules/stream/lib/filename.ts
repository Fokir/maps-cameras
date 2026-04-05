// web/src/modules/stream/lib/filename.ts

/**
 * Sanitizes a camera name for use as a filename component.
 * Replaces filesystem-forbidden characters with underscores,
 * strips control characters, trims leading/trailing whitespace and dots.
 * Returns "camera" if the result is empty.
 */
export function sanitizeCameraName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, "")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned.length > 0 ? cleaned : "camera";
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Builds a filename in the format: "{sanitized}_{YYYY-MM-DD}_{HH-MM-SS}.{ext}".
 * Uses local time, not UTC.
 */
export function buildFilename(
  cameraName: string,
  ext: string,
  date: Date = new Date()
): string {
  const sanitized = sanitizeCameraName(cameraName);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${sanitized}_${y}-${m}-${d}_${hh}-${mm}-${ss}.${ext}`;
}

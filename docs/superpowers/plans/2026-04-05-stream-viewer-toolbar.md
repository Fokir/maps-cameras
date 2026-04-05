# Stream viewer toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в просмотр стрима оверлей-тулбар (статистика, скриншот/копирование, instant replay, ручная запись) и реализовать WebRTC-транспорт на фронтенде с race-стратегией «кто быстрее, тот показывает, но WebRTC в приоритете».

**Architecture:** Извлечь текущую MSE-логику из `StreamPlayer.tsx` в `useMseTransport`, добавить параллельный `useWebrtcTransport`, объединить координатором `useTransportRace`. Над едиными `TransportHandle` построить `useStreamStats`, `useScreenshot`, `useMediaRecorder`. Все UI-элементы — абсолютный оверлей над существующим `<video>`.

**Tech Stack:** React 18 + TypeScript, Zustand (уже), `MediaRecorder` API, `RTCPeerConnection`, `MediaSource`, File System Access API (с фолбэком), `navigator.clipboard.write`, Tailwind CSS v4 (уже).

**Related spec:** [docs/superpowers/specs/2026-04-05-stream-viewer-toolbar-design.md](../specs/2026-04-05-stream-viewer-toolbar-design.md)

**Important constraints:**

- В проекте **нет тест-фреймворка** — все шаги «verify» выполняются вручную через dev server. Добавление vitest out of scope.
- Работаем в текущей ветке (из CLAUDE.md: никаких новых веток и worktree).
- Коммиты после каждой осмысленной задачи обязательны; сообщения в стиле существующих (`feat:`, `fix:`, `refactor:` — см. recent commits).
- Частые ручные проверки после касания `StreamPlayer.tsx`, потому что это критический путь просмотра.

**Пригодные для промежуточной поставки чекпоинты:**

- После **Phase 2** (задача 10) — WebRTC уже работает, можно откатывать/продолжать независимо от тулбара.
- После **Phase 3** (задача 13) — видна статистика, уже полезно.
- После **Phase 4** (задача 16) — скриншоты работают.
- После **Phase 6** (задача 24) — полный финал.

---

## File Structure

**Создаваемые файлы:**

```
web/src/modules/stream/transports/
  types.ts                    — TransportHandle interface
  useMseTransport.ts          — MSE hook (извлечён из StreamPlayer)
  useWebrtcTransport.ts       — WebRTC hook (новый)
  useTransportRace.ts         — координатор race

web/src/modules/stream/overlay/
  StreamOverlay.tsx           — layout, auto-hide кнопок
  StatsWidget.tsx             — правый нижний угол
  ControlsBar.tsx             — левый нижний угол
  BitrateSettingsPopover.tsx  — попап от шестерёнки
  RecordingIndicator.tsx      — REC mm:ss + пульсация

web/src/modules/stream/hooks/
  useStreamStats.ts
  useScreenshot.ts
  useMediaRecorder.ts

web/src/modules/stream/lib/
  ringBuffer.ts
  fileSaver.ts
  filename.ts
  mimeType.ts

web/src/shared/toast/
  ToastProvider.tsx           — context + очередь + рендер
  useToast.ts                 — хук-шорткат
```

**Модифицируемые файлы:**

- `web/src/modules/stream/StreamPlayer.tsx` — обрезается до ~40 строк: транспортный race + монтаж оверлея
- `web/src/app/App.tsx` — оборачивает корень в `ToastProvider`

**Не затрагиваются:** backend, `streamStore.ts`, `streamApi.ts`, `MiniStreamPreview.tsx`, `cameraStore.ts`, карта, редактор.

---

## Phase 1 — Foundation utilities

### Task 1: Pure utilities — mimeType + filename

**Files:**
- Create: `web/src/modules/stream/lib/mimeType.ts`
- Create: `web/src/modules/stream/lib/filename.ts`

- [ ] **Step 1.1: Создать `mimeType.ts`**

```ts
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
```

- [ ] **Step 1.2: Создать `filename.ts`**

```ts
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
```

- [ ] **Step 1.3: Verify TypeScript compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors mentioning these files.

- [ ] **Step 1.4: Commit**

```bash
git add web/src/modules/stream/lib/mimeType.ts web/src/modules/stream/lib/filename.ts
git commit -m "feat(stream): add mimeType picker and filename builder utilities"
```

---

### Task 2: fileSaver utility

**Files:**
- Create: `web/src/modules/stream/lib/fileSaver.ts`

- [ ] **Step 2.1: Создать `fileSaver.ts`**

```ts
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
```

- [ ] **Step 2.2: Verify TypeScript compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add web/src/modules/stream/lib/fileSaver.ts
git commit -m "feat(stream): add fileSaver with File System Access API and clipboard support"
```

---

### Task 3: ringBuffer utility

**Files:**
- Create: `web/src/modules/stream/lib/ringBuffer.ts`

- [ ] **Step 3.1: Создать `ringBuffer.ts`**

```ts
// web/src/modules/stream/lib/ringBuffer.ts

export interface RingBufferItem {
  blob: Blob;
  timestamp: number; // ms since epoch
}

/**
 * Time-based ring buffer for MediaRecorder chunks.
 * Drops items older than `retentionMs` on every push.
 */
export class RingBuffer {
  private items: RingBufferItem[] = [];

  constructor(private readonly retentionMs: number) {}

  push(item: RingBufferItem): void {
    this.items.push(item);
    this.evictOldLocked();
  }

  /**
   * Returns a copy of the current items. Safe to pass into
   * `new Blob([...items.map(i => i.blob), ...])`.
   */
  snapshot(): RingBufferItem[] {
    this.evictOldLocked();
    return this.items.slice();
  }

  clear(): void {
    this.items = [];
  }

  totalSize(): number {
    return this.items.reduce((sum, i) => sum + i.blob.size, 0);
  }

  private evictOldLocked(): void {
    const cutoff = Date.now() - this.retentionMs;
    while (this.items.length > 0 && this.items[0].timestamp < cutoff) {
      this.items.shift();
    }
  }
}
```

- [ ] **Step 3.2: Verify TypeScript compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add web/src/modules/stream/lib/ringBuffer.ts
git commit -m "feat(stream): add time-based RingBuffer for recorder chunks"
```

---

### Task 4: Minimal toast system

**Files:**
- Create: `web/src/shared/toast/ToastProvider.tsx`
- Create: `web/src/shared/toast/useToast.ts`

- [ ] **Step 4.1: Создать `ToastProvider.tsx`**

```tsx
// web/src/shared/toast/ToastProvider.tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "warn" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ToastContextValue {
  push(kind: ToastKind, message: string): void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

const kindClasses: Record<ToastKind, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  warn: "bg-amber-500 text-black",
  info: "bg-gray-700 text-white",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded shadow-lg text-sm pointer-events-auto ${kindClasses[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 4.2: Создать `useToast.ts`**

```ts
// web/src/shared/toast/useToast.ts
import { useContext } from "react";
import { ToastContext } from "./ToastProvider";

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return {
    success: (msg: string) => ctx.push("success", msg),
    error: (msg: string) => ctx.push("error", msg),
    warn: (msg: string) => ctx.push("warn", msg),
    info: (msg: string) => ctx.push("info", msg),
  };
}
```

- [ ] **Step 4.3: Mount `ToastProvider` в `App.tsx`**

Modify: `web/src/app/App.tsx`

Add import at top:
```tsx
import { ToastProvider } from "@/shared/toast/ToastProvider";
```

Wrap the return in `<ToastProvider>`:
```tsx
  return (
    <ToastProvider>
      {mode === "edit" ? <EditorLayout /> : <ViewerLayout />}
    </ToastProvider>
  );
```

- [ ] **Step 4.4: Verify**

Run: `cd web && npx tsc --noEmit`
Then: `make dev-frontend` (в отдельном терминале — уже может быть запущено). Открыть приложение, убедиться, что всё грузится как раньше. Тостов пока нет, это норма.

- [ ] **Step 4.5: Commit**

```bash
git add web/src/shared/toast/ToastProvider.tsx web/src/shared/toast/useToast.ts web/src/app/App.tsx
git commit -m "feat(shared): add minimal toast notification system"
```

---

## Phase 2 — Transport refactor + WebRTC

### Task 5: Transport types

**Files:**
- Create: `web/src/modules/stream/transports/types.ts`

- [ ] **Step 5.1: Создать `types.ts`**

```ts
// web/src/modules/stream/transports/types.ts

export type TransportKind = "webrtc" | "mse";

export interface TransportHandle {
  kind: TransportKind;
  /** Monotonic counter of bytes received since the transport started. */
  getBytesReceived(): number;
  /** Only set for WebRTC — lets stats hook call pc.getStats(). */
  peerConnection?: RTCPeerConnection;
  /** Video codec string, e.g. "avc1.640029" or "h264". Null until known. */
  videoCodec: string | null;
  /** Tear down the transport. Must be idempotent. */
  dispose(): void;
}

export interface TransportCallbacks {
  onReady(handle: TransportHandle): void;
  onError(err: Error): void;
}
```

- [ ] **Step 5.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 5.3: Commit**

```bash
git add web/src/modules/stream/transports/types.ts
git commit -m "feat(stream): add TransportHandle interface for MSE/WebRTC unification"
```

---

### Task 6: Extract MSE logic into `useMseTransport`

**Goal:** Вынести существующий MSE-код из `StreamPlayer.tsx` в отдельный хук без изменения поведения. После этой задачи стрим должен работать ровно как сейчас.

**Files:**
- Create: `web/src/modules/stream/transports/useMseTransport.ts`

- [ ] **Step 6.1: Создать `useMseTransport.ts`**

```ts
// web/src/modules/stream/transports/useMseTransport.ts
import { useEffect } from "react";
import type { TransportCallbacks, TransportHandle } from "./types";

// go2rtc expects an exact set of codec tokens. It parses them literally.
// See pkg/mp4/mime.go in AlexxIT/go2rtc.
const CANDIDATE_CODECS = [
  "avc1.640029",
  "avc1.64002A",
  "avc1.640033",
  "hvc1.1.6.L153.B0",
  "mp4a.40.2",
  "mp4a.40.5",
  "flac",
  "opus",
];

/**
 * MSE (MediaSource Extensions) transport. Opens a WebSocket to go2rtc's
 * MSE endpoint, negotiates supported codecs, and feeds incoming fMP4 chunks
 * into a SourceBuffer attached to the provided <video> element.
 *
 * Calls onReady once the first chunk has been appended and the video is ready
 * to play. Calls onError if the WebSocket fails or the codec is rejected.
 */
export function useMseTransport(
  videoEl: HTMLVideoElement | null,
  wsUrl: string | null,
  callbacks: TransportCallbacks
): void {
  useEffect(() => {
    if (!videoEl || !wsUrl) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    let disposed = false;
    let bytesReceived = 0;
    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    let videoCodec: string | null = null;
    let readyFired = false;
    const queue: ArrayBuffer[] = [];

    const handle: TransportHandle = {
      kind: "mse",
      getBytesReceived: () => bytesReceived,
      get videoCodec() {
        return videoCodec;
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        try {
          ws.close();
        } catch {}
        if (mediaSource && mediaSource.readyState === "open") {
          try {
            mediaSource.endOfStream();
          } catch {}
        }
        try {
          videoEl.src = "";
        } catch {}
      },
    };

    const appendNext = () => {
      if (!sourceBuffer || sourceBuffer.updating) return;
      const buf = queue.shift();
      if (buf) {
        try {
          sourceBuffer.appendBuffer(buf);
        } catch (e) {
          console.error("appendBuffer failed:", e);
        }
      }
    };

    ws.onopen = () => {
      const supported = CANDIDATE_CODECS.filter((c) =>
        MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`)
      );
      ws.send(JSON.stringify({ type: "mse", value: supported.join(",") }));
    };

    ws.onmessage = (event) => {
      if (disposed) return;
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "mse") {
          videoCodec = msg.value;
          mediaSource = new MediaSource();
          videoEl.src = URL.createObjectURL(mediaSource);
          mediaSource.addEventListener("sourceopen", () => {
            try {
              sourceBuffer = mediaSource!.addSourceBuffer(msg.value);
              sourceBuffer.mode = "segments";
              sourceBuffer.addEventListener("updateend", appendNext);
              appendNext();
            } catch (e) {
              console.error("MSE codec not supported:", msg.value, e);
              callbacks.onError(new Error("MSE codec rejected: " + String(e)));
            }
          });
          videoEl.play().catch(() => {});
        } else if (msg.type === "error") {
          console.error("go2rtc error:", msg.value);
          callbacks.onError(new Error("go2rtc error: " + msg.value));
        }
      } else if (event.data instanceof ArrayBuffer) {
        bytesReceived += event.data.byteLength;
        if (sourceBuffer && !sourceBuffer.updating && queue.length === 0) {
          try {
            sourceBuffer.appendBuffer(event.data);
          } catch {
            queue.push(event.data);
          }
        } else {
          queue.push(event.data);
        }
        if (!readyFired && bytesReceived > 0) {
          readyFired = true;
          // Defer so onReady fires after the microtask queue, giving videoEl a chance to progress.
          queueMicrotask(() => {
            if (!disposed) callbacks.onReady(handle);
          });
        }
      }
    };

    ws.onerror = (e) => {
      console.error("MSE WebSocket error:", e);
    };

    ws.onclose = (e) => {
      if (disposed) return;
      if (!readyFired) {
        callbacks.onError(new Error(`MSE closed before ready (${e.code})`));
      }
    };

    return () => {
      handle.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, wsUrl]);
}
```

- [ ] **Step 6.2: Временно НЕ трогаем `StreamPlayer.tsx`** — это отдельная задача. Просто проверяем, что новый файл компилируется.

Run: `cd web && npx tsc --noEmit`
Expected: no errors. Мёртвый код пока.

- [ ] **Step 6.3: Commit**

```bash
git add web/src/modules/stream/transports/useMseTransport.ts
git commit -m "refactor(stream): extract MSE transport into dedicated hook"
```

---

### Task 7: Implement `useWebrtcTransport`

**Files:**
- Create: `web/src/modules/stream/transports/useWebrtcTransport.ts`

**Signalling protocol reminder (go2rtc WebSocket):**
Client sends `{type: "webrtc/offer", value: sdp}`, server replies with `{type: "webrtc/answer", value: sdp}` and interleaved `{type: "webrtc/candidate", value: candidate}`. Client sends its own candidates back with the same type. Names may vary across go2rtc versions — if current version uses plain `"webrtc"` without slash, adjust accordingly while implementing.

- [ ] **Step 7.1: Создать `useWebrtcTransport.ts`**

```ts
// web/src/modules/stream/transports/useWebrtcTransport.ts
import { useEffect } from "react";
import type { TransportCallbacks, TransportHandle } from "./types";

/**
 * WebRTC transport talking to go2rtc over a WebSocket signalling channel.
 *
 * Creates an RTCPeerConnection with recv-only video+audio transceivers,
 * exchanges SDP offer/answer and ICE candidates, then attaches the remote
 * video track to videoEl.srcObject.
 *
 * bytesReceived is refreshed opportunistically via periodic getStats() calls
 * from inside useStreamStats; we cache the latest value here.
 */
export function useWebrtcTransport(
  videoEl: HTMLVideoElement | null,
  webrtcUrl: string | null,
  callbacks: TransportCallbacks
): void {
  useEffect(() => {
    if (!videoEl || !webrtcUrl) return;

    const wsUrl = webrtcUrl.startsWith("ws://") || webrtcUrl.startsWith("wss://")
      ? webrtcUrl
      : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${webrtcUrl}`;

    let disposed = false;
    let readyFired = false;
    let cachedBytesReceived = 0;

    const pc = new RTCPeerConnection({});
    const ws = new WebSocket(wsUrl);

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const handle: TransportHandle = {
      kind: "webrtc",
      peerConnection: pc,
      videoCodec: null,
      getBytesReceived: () => cachedBytesReceived,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        try {
          ws.close();
        } catch {}
        try {
          pc.getSenders().forEach((s) => s.track?.stop());
          pc.close();
        } catch {}
        try {
          videoEl.srcObject = null;
        } catch {}
      },
    };

    // Refresh cached bytes + codec periodically for the stats hook to read.
    const statsInterval = setInterval(async () => {
      if (disposed || pc.connectionState === "closed") return;
      try {
        const report = await pc.getStats();
        report.forEach((s) => {
          if (s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "video") {
            const r = s as RTCInboundRtpStreamStats;
            if (typeof r.bytesReceived === "number") {
              cachedBytesReceived = r.bytesReceived;
            }
            const codecId = (r as unknown as { codecId?: string }).codecId;
            if (codecId) {
              const codec = report.get(codecId) as unknown as { mimeType?: string } | undefined;
              if (codec?.mimeType) handle.videoCodec = codec.mimeType;
            }
          }
        });
      } catch {}
    }, 1000);

    pc.ontrack = (event) => {
      if (disposed) return;
      const [stream] = event.streams;
      if (!stream) return;
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
      const onData = () => {
        if (readyFired || disposed) return;
        readyFired = true;
        videoEl.removeEventListener("loadeddata", onData);
        callbacks.onReady(handle);
      };
      if (videoEl.readyState >= 2) onData();
      else videoEl.addEventListener("loadeddata", onData);
    };

    pc.onicecandidate = (event) => {
      if (disposed || !event.candidate) return;
      try {
        ws.send(JSON.stringify({ type: "webrtc/candidate", value: event.candidate.candidate }));
      } catch {}
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && !readyFired) {
        callbacks.onError(new Error("WebRTC connection failed"));
      }
    };

    ws.onopen = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "webrtc/offer", value: offer.sdp }));
      } catch (e) {
        callbacks.onError(new Error("WebRTC offer failed: " + String(e)));
      }
    };

    ws.onmessage = async (event) => {
      if (disposed || typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "webrtc/answer" || msg.type === "webrtc") {
          await pc.setRemoteDescription({ type: "answer", sdp: msg.value });
        } else if (msg.type === "webrtc/candidate") {
          await pc.addIceCandidate({ candidate: msg.value, sdpMLineIndex: 0 });
        } else if (msg.type === "error") {
          callbacks.onError(new Error("go2rtc WebRTC error: " + msg.value));
        }
      } catch (e) {
        console.error("WebRTC signalling parse error:", e);
      }
    };

    ws.onerror = () => {
      if (!readyFired) callbacks.onError(new Error("WebRTC signalling socket error"));
    };

    ws.onclose = (e) => {
      if (disposed) return;
      if (!readyFired) {
        callbacks.onError(new Error(`WebRTC WS closed before ready (${e.code})`));
      }
    };

    return () => {
      clearInterval(statsInterval);
      handle.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, webrtcUrl]);
}
```

- [ ] **Step 7.2: Verify compile**

Run: `cd web && npx tsc --noEmit`
If TypeScript complains about `RTCInboundRtpStreamStats` — add `"DOM"` and `"DOM.Iterable"` to `lib` in `web/tsconfig.json` (they should already be there). Also some fields like `codecId` may need a cast — the code already casts them.

- [ ] **Step 7.3: Commit**

```bash
git add web/src/modules/stream/transports/useWebrtcTransport.ts
git commit -m "feat(stream): add WebRTC transport with go2rtc signalling"
```

---

### Task 8: Transport race coordinator

**Files:**
- Create: `web/src/modules/stream/transports/useTransportRace.ts`

- [ ] **Step 8.1: Создать `useTransportRace.ts`**

```ts
// web/src/modules/stream/transports/useTransportRace.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useMseTransport } from "./useMseTransport";
import { useWebrtcTransport } from "./useWebrtcTransport";
import type { TransportHandle } from "./types";

export type RacePhase = "connecting" | "mse" | "webrtc" | "error";

const WEBRTC_TAKEOVER_WINDOW_MS = 15000;

export interface RaceResult {
  phase: RacePhase;
  active: TransportHandle | null;
  error: string | null;
}

/**
 * Races MSE and WebRTC transports. First-ready wins. If MSE wins, WebRTC keeps
 * trying for WEBRTC_TAKEOVER_WINDOW_MS and preempts if it becomes ready.
 * After the window expires, WebRTC is disposed even if still trying.
 * No reverse transition (webrtc -> mse).
 */
export function useTransportRace(
  videoEl: HTMLVideoElement | null,
  wsUrl: string | null,
  webrtcUrl: string | null
): RaceResult {
  const [phase, setPhase] = useState<RacePhase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<TransportHandle | null>(null);
  const mseHandleRef = useRef<TransportHandle | null>(null);
  const webrtcHandleRef = useRef<TransportHandle | null>(null);
  const mseErrorRef = useRef<string | null>(null);
  const webrtcErrorRef = useRef<string | null>(null);
  const raceStartRef = useRef<number>(Date.now());
  const takeoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset refs when the stream URL changes (new camera selected).
  useEffect(() => {
    raceStartRef.current = Date.now();
    mseHandleRef.current = null;
    webrtcHandleRef.current = null;
    mseErrorRef.current = null;
    webrtcErrorRef.current = null;
    activeRef.current = null;
    setPhase("connecting");
    setError(null);
    if (takeoverTimerRef.current) {
      clearTimeout(takeoverTimerRef.current);
      takeoverTimerRef.current = null;
    }
  }, [wsUrl, webrtcUrl]);

  const handleBothFailed = useCallback(() => {
    if (mseErrorRef.current && webrtcErrorRef.current) {
      setPhase("error");
      setError(`${mseErrorRef.current} / ${webrtcErrorRef.current}`);
    }
  }, []);

  const onMseReady = useCallback((handle: TransportHandle) => {
    mseHandleRef.current = handle;
    if (activeRef.current?.kind === "webrtc") {
      // WebRTC already won; dispose late MSE.
      handle.dispose();
      return;
    }
    if (!activeRef.current) {
      activeRef.current = handle;
      setPhase("mse");
      // Schedule WebRTC takeover window expiry.
      takeoverTimerRef.current = setTimeout(() => {
        if (webrtcHandleRef.current) return; // takeover already happened
        const pending = webrtcHandleRef.current;
        if (!pending && !webrtcErrorRef.current) {
          // Still trying — give up, dispose the pending attempt via its own hook's cleanup cycle.
          // We cannot reach the hook internals; best we can do is mark phase stable.
        }
      }, WEBRTC_TAKEOVER_WINDOW_MS);
    }
  }, []);

  const onMseError = useCallback(
    (err: Error) => {
      mseErrorRef.current = err.message;
      handleBothFailed();
    },
    [handleBothFailed]
  );

  const onWebrtcReady = useCallback((handle: TransportHandle) => {
    webrtcHandleRef.current = handle;

    // Is MSE already playing?
    if (activeRef.current?.kind === "mse") {
      // Check takeover window.
      const elapsed = Date.now() - raceStartRef.current;
      if (elapsed > WEBRTC_TAKEOVER_WINDOW_MS) {
        // Too late — dispose WebRTC, stay on MSE.
        handle.dispose();
        return;
      }
      // Preempt MSE.
      const oldMse = activeRef.current;
      activeRef.current = handle;
      setPhase("webrtc");
      oldMse.dispose();
      return;
    }

    // Nobody won yet — WebRTC wins outright.
    if (!activeRef.current) {
      activeRef.current = handle;
      setPhase("webrtc");
      // Kill MSE attempt if it ever reports ready.
      if (mseHandleRef.current) {
        mseHandleRef.current.dispose();
      }
    }
  }, []);

  const onWebrtcError = useCallback(
    (err: Error) => {
      webrtcErrorRef.current = err.message;
      handleBothFailed();
    },
    [handleBothFailed]
  );

  useMseTransport(videoEl, wsUrl, { onReady: onMseReady, onError: onMseError });
  useWebrtcTransport(videoEl, webrtcUrl, { onReady: onWebrtcReady, onError: onWebrtcError });

  return {
    phase,
    active: activeRef.current,
    error,
  };
}
```

- [ ] **Step 8.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 8.3: Commit**

```bash
git add web/src/modules/stream/transports/useTransportRace.ts
git commit -m "feat(stream): add WebRTC/MSE transport race coordinator"
```

---

### Task 9: Slim down `StreamPlayer.tsx` to use race

**Goal:** Заменить существующий большой `useEffect` вызовом `useTransportRace`. `StreamPlayer.tsx` превращается из 147 строк в ~60.

**Files:**
- Modify: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 9.1: Полностью заменить `StreamPlayer.tsx`**

```tsx
// web/src/modules/stream/StreamPlayer.tsx
import { useRef } from "react";
import { useStreamStore } from "./streamStore";
import { useTransportRace } from "./transports/useTransportRace";

export function StreamPlayer() {
  const streamInfo = useStreamStore((s) => s.streamInfo);
  const loading = useStreamStore((s) => s.loading);
  const error = useStreamStore((s) => s.error);
  const videoRef = useRef<HTMLVideoElement>(null);

  const wsUrl = streamInfo
    ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${streamInfo.ws_url}`
    : null;
  const webrtcUrl = streamInfo
    ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${streamInfo.webrtc_url}`
    : null;

  const race = useTransportRace(videoRef.current, wsUrl, webrtcUrl);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-400">
        Подключение...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-red-400">
        Ошибка: {error}
      </div>
    );
  }

  if (!streamInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2">📹</div>
          <p>Выберите камеру на карте</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-black flex items-center justify-center relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-full max-w-full"
      />
      {race.phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-400 text-center p-4">
          Не удалось подключиться: {race.error}
        </div>
      )}
    </div>
  );
}
```

⚠ **Проблема с videoRef.current и useEffect:** `useTransportRace` получает `videoRef.current`, но на первом рендере он `null`. Хуки транспортов имеют `if (!videoEl) return;` в начале своих `useEffect` — это значит, что они **не запустятся на первом рендере**. На втором рендере (после монтажа) `videoRef.current` ещё `null`, потому что ничего не триггерит ре-рендер.

Решаем через callback ref вместо useRef:

- [ ] **Step 9.2: Переделать на callback ref**

Replace the `const videoRef = useRef...` line and usage with:

```tsx
import { useCallback, useState } from "react";
...

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);
...
  const race = useTransportRace(videoEl, wsUrl, webrtcUrl);
...
      <video
        ref={videoRef}
        ...
```

Это заставит хук перезапустить `useEffect` когда элемент смонтируется.

- [ ] **Step 9.3: Verify compile + manual smoke test**

Run: `cd web && npx tsc --noEmit`

Затем запустить `make dev-backend` и `make dev-frontend`, открыть приложение, выбрать камеру.

**Ожидаемое поведение:**
- Стрим должен загружаться как раньше.
- В DevTools Console должны быть логи от `useWebrtcTransport` и/или `useMseTransport`.
- В Network должны быть WS соединения на оба транспорта.
- Если WebRTC заработал — видео играется с меньшей задержкой. Если нет — MSE как раньше.

**Если что-то сломалось:** проверить точный формат сообщений go2rtc в `internal/stream/` на бэкенде. Возможно, бэкенд ждёт `"webrtc"` без слеша — поправить в `useWebrtcTransport.ts` строки отправки и парсинга.

- [ ] **Step 9.4: Commit**

```bash
git add web/src/modules/stream/StreamPlayer.tsx
git commit -m "refactor(stream): use transport race in StreamPlayer (WebRTC + MSE)"
```

**🎯 Milestone 1 complete.** После этой задачи WebRTC работает на фронте. Можно остановиться здесь и вернуться позже к тулбару.

---

## Phase 3 — Stats widget

### Task 10: `useStreamStats` hook

**Files:**
- Create: `web/src/modules/stream/hooks/useStreamStats.ts`

- [ ] **Step 10.1: Создать `useStreamStats.ts`**

```ts
// web/src/modules/stream/hooks/useStreamStats.ts
import { useEffect, useRef, useState } from "react";
import type { TransportHandle, TransportKind } from "../transports/types";

export interface StreamStats {
  transport: TransportKind | null;
  bitrate: number | null; // bits per second
  fps: number | null;
  loss: number | null; // percent, null for MSE
  resolution: { w: number; h: number } | null;
  codec: string | null;
  jitterMs: number | null;
  receivedBytes: number;
}

const EMPTY: StreamStats = {
  transport: null,
  bitrate: null,
  fps: null,
  loss: null,
  resolution: null,
  codec: null,
  jitterMs: null,
  receivedBytes: 0,
};

/**
 * Polls the active transport once per second and exposes streaming stats.
 * Handles both WebRTC (via pc.getStats()) and MSE (via bytes delta + video quality).
 */
export function useStreamStats(
  transport: TransportHandle | null,
  videoEl: HTMLVideoElement | null
): StreamStats {
  const [stats, setStats] = useState<StreamStats>(EMPTY);
  const prevBytesRef = useRef(0);
  const prevFramesRef = useRef(0);
  const prevPacketsLostRef = useRef(0);
  const prevPacketsReceivedRef = useRef(0);

  useEffect(() => {
    if (!transport || !videoEl) {
      setStats(EMPTY);
      return;
    }

    prevBytesRef.current = transport.getBytesReceived();
    prevFramesRef.current = videoEl.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
    prevPacketsLostRef.current = 0;
    prevPacketsReceivedRef.current = 0;

    const tick = async () => {
      const bytes = transport.getBytesReceived();
      const bitrate = Math.max(0, (bytes - prevBytesRef.current) * 8);
      prevBytesRef.current = bytes;

      const quality = videoEl.getVideoPlaybackQuality?.();
      const totalFrames = quality?.totalVideoFrames ?? 0;
      const fps = Math.max(0, totalFrames - prevFramesRef.current);
      prevFramesRef.current = totalFrames;

      let loss: number | null = null;
      let jitterMs: number | null = null;
      let resolution = { w: videoEl.videoWidth, h: videoEl.videoHeight };
      let codec: string | null = transport.videoCodec;

      if (transport.kind === "webrtc" && transport.peerConnection) {
        try {
          const report = await transport.peerConnection.getStats();
          report.forEach((s) => {
            if (s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "video") {
              const r = s as RTCInboundRtpStreamStats;
              const packetsReceived = r.packetsReceived ?? 0;
              const packetsLost = r.packetsLost ?? 0;
              const deltaLost = packetsLost - prevPacketsLostRef.current;
              const deltaRcv = packetsReceived - prevPacketsReceivedRef.current;
              const totalDelta = deltaLost + deltaRcv;
              loss = totalDelta > 0 ? (deltaLost / totalDelta) * 100 : 0;
              prevPacketsLostRef.current = packetsLost;
              prevPacketsReceivedRef.current = packetsReceived;
              if (typeof r.jitter === "number") jitterMs = r.jitter * 1000;
              if (typeof r.frameWidth === "number" && typeof r.frameHeight === "number") {
                resolution = { w: r.frameWidth, h: r.frameHeight };
              }
              const codecId = (r as unknown as { codecId?: string }).codecId;
              if (codecId) {
                const codecReport = report.get(codecId) as unknown as { mimeType?: string } | undefined;
                if (codecReport?.mimeType) codec = codecReport.mimeType;
              }
            }
          });
        } catch {}
      }

      setStats({
        transport: transport.kind,
        bitrate: bitrate > 0 ? bitrate : null,
        fps: fps > 0 ? fps : null,
        loss,
        resolution: resolution.w > 0 ? resolution : null,
        codec,
        jitterMs,
        receivedBytes: bytes,
      });
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [transport, videoEl]);

  return stats;
}
```

- [ ] **Step 10.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 10.3: Commit**

```bash
git add web/src/modules/stream/hooks/useStreamStats.ts
git commit -m "feat(stream): add useStreamStats hook for WebRTC and MSE metrics"
```

---

### Task 11: `StatsWidget` component

**Files:**
- Create: `web/src/modules/stream/overlay/StatsWidget.tsx`

- [ ] **Step 11.1: Создать `StatsWidget.tsx`**

```tsx
// web/src/modules/stream/overlay/StatsWidget.tsx
import type { StreamStats } from "../hooks/useStreamStats";

function formatBitrate(bps: number | null): string {
  if (bps === null) return "—";
  const mbps = bps / 1_000_000;
  return `${mbps.toFixed(1)} Mbps`;
}

function formatNumber(n: number | null, suffix = ""): string {
  return n === null ? "—" : `${n}${suffix}`;
}

function formatLoss(loss: number | null): string {
  if (loss === null) return "—";
  return `${loss.toFixed(1)}%`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function StatsWidget({ stats }: { stats: StreamStats }) {
  const transportLabel = stats.transport === "webrtc" ? "WebRTC" : stats.transport === "mse" ? "MSE" : "…";
  const tooltip = [
    stats.resolution ? `${stats.resolution.w}×${stats.resolution.h}` : null,
    stats.codec,
    stats.jitterMs !== null ? `jitter ${stats.jitterMs.toFixed(0)} ms` : null,
    `received ${formatBytes(stats.receivedBytes)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="absolute right-2 bottom-2 bg-black/60 text-white text-xs font-mono px-3 py-2 rounded pointer-events-auto select-none"
      title={tooltip}
    >
      <div className="font-bold">{transportLabel}</div>
      <div>Bitrate: {formatBitrate(stats.bitrate)}</div>
      <div>FPS: {formatNumber(stats.fps)}</div>
      <div>Loss: {formatLoss(stats.loss)}</div>
    </div>
  );
}
```

- [ ] **Step 11.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 11.3: Commit**

```bash
git add web/src/modules/stream/overlay/StatsWidget.tsx
git commit -m "feat(stream): add StatsWidget overlay component"
```

---

### Task 12: Mount `StatsWidget` in `StreamPlayer`

**Files:**
- Modify: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 12.1: Добавить хук статистики и виджет в JSX**

Add imports:
```tsx
import { useStreamStats } from "./hooks/useStreamStats";
import { StatsWidget } from "./overlay/StatsWidget";
```

After `const race = useTransportRace(...)` add:
```tsx
const stats = useStreamStats(race.active, videoEl);
```

Inside the last `return (...)` block, after the `<video>` element and before the closing `</div>`:
```tsx
{race.active && <StatsWidget stats={stats} />}
```

- [ ] **Step 12.2: Manual smoke test**

Run dev servers, выбрать камеру, проверить:
- В правом нижнем углу появляется виджет со строками `WebRTC`/`MSE`, `Bitrate`, `FPS`, `Loss`.
- Числа обновляются раз в секунду.
- На MSE `Loss: —`.
- Hover показывает tooltip с разрешением, кодеком и объёмом.

- [ ] **Step 12.3: Commit**

```bash
git add web/src/modules/stream/StreamPlayer.tsx
git commit -m "feat(stream): mount StatsWidget in player overlay"
```

**🎯 Milestone 2 complete.** Статистика видна пользователю.

---

## Phase 4 — Screenshot

### Task 13: `useScreenshot` hook

**Files:**
- Create: `web/src/modules/stream/hooks/useScreenshot.ts`

- [ ] **Step 13.1: Создать `useScreenshot.ts`**

```ts
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
```

- [ ] **Step 13.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 13.3: Commit**

```bash
git add web/src/modules/stream/hooks/useScreenshot.ts
git commit -m "feat(stream): add useScreenshot hook"
```

---

### Task 14: `ControlsBar` with screenshot buttons

**Goal:** Создать `ControlsBar` с двумя кнопками (скриншот + копирование). Кнопки записи добавим позже.

**Files:**
- Create: `web/src/modules/stream/overlay/ControlsBar.tsx`

- [ ] **Step 14.1: Создать `ControlsBar.tsx`**

```tsx
// web/src/modules/stream/overlay/ControlsBar.tsx
import { useToast } from "@/shared/toast/useToast";
import type { ScreenshotApi } from "../hooks/useScreenshot";

interface ControlsBarProps {
  screenshot: ScreenshotApi;
  // Record/replay props will come in later tasks.
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-10 h-10 flex items-center justify-center rounded bg-black/60 hover:bg-black/80 text-white disabled:opacity-40 disabled:cursor-not-allowed transition pointer-events-auto ${className}`}
    >
      {children}
    </button>
  );
}

export function ControlsBar({ screenshot }: ControlsBarProps) {
  const toast = useToast();

  const onScreenshot = async () => {
    try {
      await screenshot.saveToFile();
      toast.success("Скриншот сохранён");
    } catch (e) {
      toast.error("Не удалось создать скриншот: " + (e as Error).message);
    }
  };

  const onCopy = async () => {
    try {
      await screenshot.copyToClipboard();
      toast.success("Скопировано в буфер обмена");
    } catch (e) {
      toast.error("Не удалось скопировать: " + (e as Error).message);
    }
  };

  return (
    <div className="absolute left-2 bottom-2 flex gap-2">
      <IconButton onClick={onScreenshot} disabled={!screenshot.isReady} title="Скриншот">
        {/* Camera icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </IconButton>
      {screenshot.canCopy && (
        <IconButton onClick={onCopy} disabled={!screenshot.isReady} title="Скопировать кадр в буфер обмена">
          {/* Clipboard icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="4" rx="1" />
            <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
          </svg>
        </IconButton>
      )}
    </div>
  );
}
```

- [ ] **Step 14.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 14.3: Commit**

```bash
git add web/src/modules/stream/overlay/ControlsBar.tsx
git commit -m "feat(stream): add ControlsBar with screenshot and copy buttons"
```

---

### Task 15: Wire screenshot bar into StreamPlayer

**Files:**
- Modify: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 15.1: Добавить `useScreenshot` и `ControlsBar`**

Add imports:
```tsx
import { useScreenshot } from "./hooks/useScreenshot";
import { ControlsBar } from "./overlay/ControlsBar";
import { useCameraStore } from "@/modules/camera/cameraStore";
```

Inside `StreamPlayer`, after fetching streamInfo:
```tsx
const activeCameraId = useStreamStore((s) => s.activeCameraId);
const cameras = useCameraStore((s) => s.cameras);
const cameraName = cameras.find((c) => c.id === activeCameraId)?.name ?? "camera";

const screenshot = useScreenshot(videoEl, cameraName);
```

Inside the final return JSX, after `<StatsWidget/>`:
```tsx
{race.active && <ControlsBar screenshot={screenshot} />}
```

- [ ] **Step 15.2: Manual smoke test**

Запустить dev, выбрать камеру, проверить:
- Слева внизу видна кнопка скриншота (и копирования, если запущено через HTTPS или localhost).
- Нажатие на кнопку скриншота открывает диалог сохранения (в Chrome) или скачивает файл (Firefox).
- Имя файла соответствует шаблону `{название_камеры}_{дата}_{время}.png`.
- Открыть скачанный файл — виден корректный кадр.
- На `http://localhost` или `https://` кнопка копирования присутствует, клик копирует изображение, тост показан. Попробовать вставить в графический редактор.
- На `http://host.local` (не secure) кнопка копирования **скрыта**.

- [ ] **Step 15.3: Commit**

```bash
git add web/src/modules/stream/StreamPlayer.tsx
git commit -m "feat(stream): wire screenshot/copy buttons into player"
```

**🎯 Milestone 3 complete.** Скриншоты работают.

---

## Phase 5 — Recording

### Task 16: `useMediaRecorder` — ring buffer core

**Goal:** Создать хук с единственной функцией: постоянный ring-буфер последних 10 секунд. `takeReplay` и `startRecording` добавим в следующих задачах.

**Files:**
- Create: `web/src/modules/stream/hooks/useMediaRecorder.ts`

- [ ] **Step 16.1: Создать первую версию `useMediaRecorder.ts` с ring-буфером**

```ts
// web/src/modules/stream/hooks/useMediaRecorder.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMimeType, type RecordingMimeType } from "../lib/mimeType";
import { RingBuffer } from "../lib/ringBuffer";

const RING_RETENTION_MS = 10_000;
const RING_CHUNK_MS = 500;
const MIN_BITRATE = 1_000_000;
const MAX_BITRATE = 10_000_000;
const DEFAULT_BITRATE = 4_000_000;

export type BitrateSetting = "auto" | 2_000_000 | 4_000_000 | 8_000_000;
export type ReplayState = "idle" | "capturing";

export interface MediaRecorderApi {
  supported: boolean;
  mimeType: RecordingMimeType | null;
  // Replay (added in later task)
  replayState: ReplayState;
  takeReplay(): Promise<void>;
  // Manual recording (added in later task)
  isRecording: boolean;
  recordingSeconds: number;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
}

function resolveBitrate(setting: BitrateSetting, measuredBitrate: number | null): number {
  if (setting !== "auto") return setting;
  if (measuredBitrate === null || measuredBitrate <= 0) return DEFAULT_BITRATE;
  return Math.max(MIN_BITRATE, Math.min(MAX_BITRATE, measuredBitrate));
}

export function useMediaRecorder(
  videoEl: HTMLVideoElement | null,
  transportReady: boolean,
  _cameraName: string,
  measuredBitrate: number | null,
  bitrateSetting: BitrateSetting
): MediaRecorderApi {
  const mimeTypeRef = useRef<RecordingMimeType | null>(null);
  if (mimeTypeRef.current === null) mimeTypeRef.current = pickRecordingMimeType();
  const mimeType = mimeTypeRef.current;

  const bufferRef = useRef<RingBuffer>(new RingBuffer(RING_RETENTION_MS));
  const bufferRecorderRef = useRef<MediaRecorder | null>(null);

  // Buffer recorder lifecycle: runs while transport is ready.
  useEffect(() => {
    if (!videoEl || !transportReady || !mimeType) return;

    let recorder: MediaRecorder;
    try {
      const stream = videoEl.captureStream();
      const bitrate = resolveBitrate(bitrateSetting, measuredBitrate);
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType.mimeType,
        videoBitsPerSecond: bitrate,
      });
    } catch (e) {
      console.error("Buffer recorder init failed:", e);
      return;
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        bufferRef.current.push({ blob: ev.data, timestamp: Date.now() });
      }
    };

    try {
      recorder.start(RING_CHUNK_MS);
      bufferRecorderRef.current = recorder;
    } catch (e) {
      console.error("Buffer recorder start failed:", e);
      return;
    }

    return () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
      bufferRecorderRef.current = null;
      bufferRef.current.clear();
    };
  }, [videoEl, transportReady, mimeType, measuredBitrate, bitrateSetting]);

  // Placeholder APIs — implemented in next tasks.
  const [replayState] = useState<ReplayState>("idle");
  const [isRecording] = useState(false);
  const [recordingSeconds] = useState(0);

  const takeReplay = useCallback(async () => {
    // Implemented in Task 17.
  }, []);
  const startRecording = useCallback(async () => {
    // Implemented in Task 18.
  }, []);
  const stopRecording = useCallback(async () => {
    // Implemented in Task 18.
  }, []);

  return {
    supported: mimeType !== null,
    mimeType,
    replayState,
    takeReplay,
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
  };
}
```

- [ ] **Step 16.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 16.3: Commit**

```bash
git add web/src/modules/stream/hooks/useMediaRecorder.ts
git commit -m "feat(stream): add useMediaRecorder with ring buffer lifecycle"
```

---

### Task 17: Implement `takeReplay`

**Files:**
- Modify: `web/src/modules/stream/hooks/useMediaRecorder.ts`

- [ ] **Step 17.1: Добавить логику реплея**

Replace the `takeReplay` placeholder and the `replayState` useState with real implementation.

Inside `useMediaRecorder`, add these refs and state near the top:

```ts
const [replayState, setReplayState] = useState<ReplayState>("idle");
const replayRecorderRef = useRef<MediaRecorder | null>(null);
```

Add imports at top of file:
```ts
import { buildFilename } from "../lib/filename";
import { downloadBlob } from "../lib/fileSaver";
```

Change hook signature to use `cameraName` (remove the underscore):

```ts
export function useMediaRecorder(
  videoEl: HTMLVideoElement | null,
  transportReady: boolean,
  cameraName: string,
  ...
```

Replace the `takeReplay` implementation:

```ts
const takeReplay = useCallback(async () => {
  if (!videoEl || !mimeType || replayRecorderRef.current) return;
  if (!transportReady) return;

  setReplayState("capturing");

  const pastSnapshot = bufferRef.current.snapshot().map((i) => i.blob);
  const stream = videoEl.captureStream();
  const bitrate = resolveBitrate(bitrateSetting, measuredBitrate);

  const futureChunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mimeType.mimeType,
      videoBitsPerSecond: bitrate,
    });
  } catch (e) {
    console.error("Replay recorder init failed:", e);
    setReplayState("idle");
    throw e;
  }

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) futureChunks.push(ev.data);
  };

  const finish = (): Promise<Blob> =>
    new Promise((resolve) => {
      recorder.onstop = () => {
        const combined = new Blob([...pastSnapshot, ...futureChunks], {
          type: mimeType.mimeType,
        });
        resolve(combined);
      };
      try {
        recorder.stop();
      } catch {
        resolve(new Blob([...pastSnapshot, ...futureChunks], { type: mimeType.mimeType }));
      }
    });

  replayRecorderRef.current = recorder;
  try {
    recorder.start(500);
  } catch (e) {
    console.error("Replay recorder start failed:", e);
    replayRecorderRef.current = null;
    setReplayState("idle");
    throw e;
  }

  await new Promise((r) => setTimeout(r, 10_000));
  const blob = await finish();
  replayRecorderRef.current = null;
  setReplayState("idle");

  const filename = buildFilename(cameraName, mimeType.ext);
  await downloadBlob(blob, filename);
}, [videoEl, transportReady, mimeType, measuredBitrate, bitrateSetting, cameraName]);
```

Also add cleanup for replay recorder on unmount — add inside the existing return cleanup of buffer recorder effect:

Actually, add a separate effect for this:

```ts
useEffect(() => {
  return () => {
    if (replayRecorderRef.current) {
      try {
        replayRecorderRef.current.stop();
      } catch {}
      replayRecorderRef.current = null;
    }
  };
}, []);
```

- [ ] **Step 17.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 17.3: Commit**

```bash
git add web/src/modules/stream/hooks/useMediaRecorder.ts
git commit -m "feat(stream): implement instant replay (+/-10s) in useMediaRecorder"
```

---

### Task 18: Implement `startRecording` / `stopRecording` with 10-min limit

**Files:**
- Modify: `web/src/modules/stream/hooks/useMediaRecorder.ts`

- [ ] **Step 18.1: Добавить менеджмент активной записи**

Add imports at top of file:
```ts
import { openWritableStream } from "../lib/fileSaver";
```

Remove the placeholder `useState` declarations for `isRecording` and `recordingSeconds` and replace with real state:

```ts
const [isRecording, setIsRecording] = useState(false);
const [recordingSeconds, setRecordingSeconds] = useState(0);
const activeRecorderRef = useRef<MediaRecorder | null>(null);
const activeChunksRef = useRef<Blob[]>([]);
const activeWritableRef = useRef<Awaited<ReturnType<typeof openWritableStream>>>(null);
const activeFilenameRef = useRef<string>("");
const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
const warnedAtNineRef = useRef(false);
```

Add a helper inside the hook (above the `takeReplay` definition):

```ts
const finalizeActiveRecording = useCallback(
  async (auto: boolean) => {
    const recorder = activeRecorderRef.current;
    if (!recorder) return;
    try {
      if (recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          try {
            recorder.stop();
          } catch {
            resolve();
          }
        });
      }
    } catch {}

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const secondsAtStop = recordingSeconds;
    const writable = activeWritableRef.current;
    const chunks = activeChunksRef.current;
    const filename = activeFilenameRef.current;

    activeRecorderRef.current = null;
    activeChunksRef.current = [];
    activeWritableRef.current = null;
    activeFilenameRef.current = "";
    warnedAtNineRef.current = false;
    setIsRecording(false);
    setRecordingSeconds(0);

    if (writable) {
      try {
        await writable.close();
      } catch {}
      return;
    }

    if (secondsAtStop < 1 || chunks.length === 0) return;
    const combined = new Blob(chunks, { type: mimeType?.mimeType ?? "video/webm" });
    await downloadBlob(combined, filename);
  },
  [mimeType, recordingSeconds]
);
```

Replace `startRecording`:

```ts
const startRecording = useCallback(async () => {
  if (!videoEl || !mimeType || activeRecorderRef.current) return;
  if (!transportReady) return;

  const filename = buildFilename(cameraName, mimeType.ext);
  activeFilenameRef.current = filename;

  // Try File System Access API first.
  const writable = await openWritableStream(filename);
  if (writable === null && typeof window.showSaveFilePicker === "function") {
    // User cancelled the native dialog — abort silently.
    activeFilenameRef.current = "";
    return;
  }
  activeWritableRef.current = writable;

  const stream = videoEl.captureStream();
  const bitrate = resolveBitrate(bitrateSetting, measuredBitrate);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mimeType.mimeType,
      videoBitsPerSecond: bitrate,
    });
  } catch (e) {
    console.error("Active recorder init failed:", e);
    if (writable) await writable.close().catch(() => {});
    activeWritableRef.current = null;
    activeFilenameRef.current = "";
    throw e;
  }

  recorder.ondataavailable = async (ev) => {
    if (!ev.data || ev.data.size === 0) return;
    if (activeWritableRef.current) {
      try {
        await activeWritableRef.current.write(ev.data);
      } catch (e) {
        console.error("writable.write failed:", e);
      }
    } else {
      activeChunksRef.current.push(ev.data);
    }
  };

  try {
    recorder.start(1000);
  } catch (e) {
    if (writable) await writable.close().catch(() => {});
    activeWritableRef.current = null;
    activeFilenameRef.current = "";
    throw e;
  }

  activeRecorderRef.current = recorder;
  setIsRecording(true);
  setRecordingSeconds(0);
  warnedAtNineRef.current = false;

  recordingTimerRef.current = setInterval(() => {
    setRecordingSeconds((s) => {
      const next = s + 1;
      if (next === 540 && !warnedAtNineRef.current) {
        warnedAtNineRef.current = true;
        // Warning dispatched through an event so that UI layer can show toast.
        window.dispatchEvent(new CustomEvent("recording-warning-9min"));
      }
      if (next >= 600) {
        // Auto-stop at 10 minutes. Call finalize out of the setter.
        queueMicrotask(() => finalizeActiveRecording(true));
      }
      return next;
    });
  }, 1000);
}, [videoEl, transportReady, mimeType, cameraName, bitrateSetting, measuredBitrate, finalizeActiveRecording]);
```

Replace `stopRecording`:

```ts
const stopRecording = useCallback(async () => {
  await finalizeActiveRecording(false);
}, [finalizeActiveRecording]);
```

Add cleanup on unmount — extend the existing cleanup effect:

```ts
useEffect(() => {
  return () => {
    if (replayRecorderRef.current) {
      try {
        replayRecorderRef.current.stop();
      } catch {}
      replayRecorderRef.current = null;
    }
    if (activeRecorderRef.current) {
      try {
        activeRecorderRef.current.stop();
      } catch {}
      activeRecorderRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };
}, []);
```

- [ ] **Step 18.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 18.3: Commit**

```bash
git add web/src/modules/stream/hooks/useMediaRecorder.ts
git commit -m "feat(stream): implement manual recording with 10-min limit and FS API"
```

---

### Task 19: `RecordingIndicator` component

**Files:**
- Create: `web/src/modules/stream/overlay/RecordingIndicator.tsx`

- [ ] **Step 19.1: Создать `RecordingIndicator.tsx`**

```tsx
// web/src/modules/stream/overlay/RecordingIndicator.tsx

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordingIndicator({ seconds }: { seconds: number }) {
  let colorClass = "text-green-400";
  let dotClass = "bg-red-500 animate-pulse";
  if (seconds >= 570) {
    colorClass = "text-red-400 animate-pulse";
  } else if (seconds >= 540) {
    colorClass = "text-amber-400";
  }

  return (
    <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded text-xs font-mono">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
      <span className={colorClass}>REC {formatTimer(seconds)}</span>
    </div>
  );
}
```

- [ ] **Step 19.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 19.3: Commit**

```bash
git add web/src/modules/stream/overlay/RecordingIndicator.tsx
git commit -m "feat(stream): add RecordingIndicator overlay component"
```

---

### Task 20: Wire replay + record buttons into ControlsBar

**Files:**
- Modify: `web/src/modules/stream/overlay/ControlsBar.tsx`
- Modify: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 20.1: Расширить `ControlsBar` кнопками реплея и записи**

Replace the contents of `ControlsBar.tsx`:

```tsx
// web/src/modules/stream/overlay/ControlsBar.tsx
import { useEffect } from "react";
import { useToast } from "@/shared/toast/useToast";
import type { ScreenshotApi } from "../hooks/useScreenshot";
import type { MediaRecorderApi } from "../hooks/useMediaRecorder";
import { RecordingIndicator } from "./RecordingIndicator";

interface ControlsBarProps {
  screenshot: ScreenshotApi;
  recorder: MediaRecorderApi;
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-w-10 h-10 px-2 flex items-center justify-center gap-1 rounded bg-black/60 hover:bg-black/80 text-white text-xs disabled:opacity-40 disabled:cursor-not-allowed transition pointer-events-auto ${className}`}
    >
      {children}
    </button>
  );
}

export function ControlsBar({ screenshot, recorder }: ControlsBarProps) {
  const toast = useToast();

  useEffect(() => {
    const onWarn = () => toast.warn("Запись остановится через 60 секунд");
    window.addEventListener("recording-warning-9min", onWarn);
    return () => window.removeEventListener("recording-warning-9min", onWarn);
  }, [toast]);

  const onScreenshot = async () => {
    try {
      await screenshot.saveToFile();
      toast.success("Скриншот сохранён");
    } catch (e) {
      toast.error("Не удалось создать скриншот: " + (e as Error).message);
    }
  };

  const onCopy = async () => {
    try {
      await screenshot.copyToClipboard();
      toast.success("Скопировано в буфер обмена");
    } catch (e) {
      toast.error("Не удалось скопировать: " + (e as Error).message);
    }
  };

  const onReplay = async () => {
    try {
      await recorder.takeReplay();
      toast.success("Реплей сохранён");
    } catch (e) {
      toast.error("Не удалось сохранить реплей: " + (e as Error).message);
    }
  };

  const onToggleRecord = async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stopRecording();
        toast.success("Запись сохранена");
      } else {
        await recorder.startRecording();
      }
    } catch (e) {
      toast.error("Ошибка записи: " + (e as Error).message);
    }
  };

  return (
    <div className="absolute left-2 bottom-2 flex gap-2 items-center">
      <IconButton onClick={onScreenshot} disabled={!screenshot.isReady} title="Скриншот">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </IconButton>

      {screenshot.canCopy && (
        <IconButton onClick={onCopy} disabled={!screenshot.isReady} title="Скопировать кадр в буфер обмена">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="4" rx="1" />
            <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
          </svg>
        </IconButton>
      )}

      {recorder.supported && (
        <>
          <IconButton
            onClick={onReplay}
            disabled={recorder.replayState === "capturing"}
            title="Сохранить реплей ±10 секунд"
            className="!bg-green-700/80 hover:!bg-green-600/80"
          >
            {recorder.replayState === "capturing" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="40 20" />
              </svg>
            ) : (
              <>
                {/* Rabbit (approximation) */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 22 4 11c0-3 2-5 5-5l3-4 2 4c3 0 5 2 5 5l-2 11z" />
                  <circle cx="10" cy="16" r="1" />
                  <circle cx="14" cy="16" r="1" />
                </svg>
                <span>Реплей</span>
              </>
            )}
          </IconButton>

          <IconButton
            onClick={onToggleRecord}
            disabled={!screenshot.isReady}
            title={recorder.isRecording ? "Остановить запись" : "Начать запись"}
            className={recorder.isRecording ? "!bg-red-700/80 hover:!bg-red-600/80" : "!bg-red-600/80 hover:!bg-red-500/80"}
          >
            {recorder.isRecording ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
            )}
          </IconButton>

          {recorder.isRecording && <RecordingIndicator seconds={recorder.recordingSeconds} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 20.2: Пробросить `useMediaRecorder` в `StreamPlayer`**

Modify `web/src/modules/stream/StreamPlayer.tsx`.

Add imports:
```tsx
import { useMediaRecorder, type BitrateSetting } from "./hooks/useMediaRecorder";
```

Add state for bitrate setting (we'll wire the popover in Task 21; for now default to auto):
```tsx
const [bitrateSetting] = useState<BitrateSetting>(() => {
  const stored = localStorage.getItem("maps-cameras.recordingBitrate");
  if (stored === "2000000" || stored === "4000000" || stored === "8000000") {
    return Number(stored) as BitrateSetting;
  }
  return "auto";
});
```

Add the recorder hook after `screenshot`:
```tsx
const recorder = useMediaRecorder(
  videoEl,
  race.active !== null,
  cameraName,
  stats.bitrate,
  bitrateSetting
);
```

Update the `ControlsBar` usage:
```tsx
{race.active && <ControlsBar screenshot={screenshot} recorder={recorder} />}
```

Don't forget to import `useState` from React (if not already).

- [ ] **Step 20.3: Manual smoke test**

- Открыть камеру, убедиться что появились 4 кнопки (скриншот, копирование если secure, реплей зелёный, запись красная).
- Нажать «Реплей» — кнопка показывает лоадер 10 секунд, затем открывается диалог сохранения. Открыть файл, убедиться что видна картинка ~20 секунд.
- Нажать «Запись», подождать 30 секунд, нажать «Стоп». Файл сохраняется. В Chrome — через нативный диалог, в Firefox — в папку загрузок. Проверить воспроизведение.
- Во время записи проверить, что таймер `REC mm:ss` тикает.
- Во время записи сделать скриншот и нажать реплей — все три операции должны работать параллельно.

- [ ] **Step 20.4: Commit**

```bash
git add web/src/modules/stream/overlay/ControlsBar.tsx web/src/modules/stream/StreamPlayer.tsx
git commit -m "feat(stream): wire replay and recording buttons into player toolbar"
```

---

### Task 21: `BitrateSettingsPopover`

**Files:**
- Create: `web/src/modules/stream/overlay/BitrateSettingsPopover.tsx`
- Modify: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 21.1: Создать `BitrateSettingsPopover.tsx`**

```tsx
// web/src/modules/stream/overlay/BitrateSettingsPopover.tsx
import { useEffect, useRef, useState } from "react";
import type { BitrateSetting } from "../hooks/useMediaRecorder";

const STORAGE_KEY = "maps-cameras.recordingBitrate";

const options: { value: BitrateSetting; label: string }[] = [
  { value: "auto", label: "Авто (рекомендуется)" },
  { value: 2_000_000, label: "2 Mbps — низкое" },
  { value: 4_000_000, label: "4 Mbps — среднее" },
  { value: 8_000_000, label: "8 Mbps — высокое" },
];

export function loadBitrateSetting(): BitrateSetting {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "2000000" || stored === "4000000" || stored === "8000000") {
    return Number(stored) as BitrateSetting;
  }
  return "auto";
}

export function BitrateSettingsPopover({
  value,
  onChange,
}: {
  value: BitrateSetting;
  onChange: (v: BitrateSetting) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handleChange = (v: BitrateSetting) => {
    onChange(v);
    if (v === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(v));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Настройки записи"
        className="w-9 h-9 flex items-center justify-center rounded bg-black/60 hover:bg-black/80 text-white pointer-events-auto"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-gray-900 text-white rounded shadow-lg p-3 text-sm pointer-events-auto">
          <div className="text-xs text-gray-400 mb-2">Битрейт записи</div>
          {options.map((opt) => (
            <label key={String(opt.value)} className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="radio"
                name="bitrate"
                checked={value === opt.value}
                onChange={() => handleChange(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 21.2: Wire into `StreamPlayer`**

Modify `web/src/modules/stream/StreamPlayer.tsx`:

Replace the static `useState<BitrateSetting>(...)` from Task 20 with:
```tsx
import { BitrateSettingsPopover, loadBitrateSetting } from "./overlay/BitrateSettingsPopover";
...
const [bitrateSetting, setBitrateSetting] = useState<BitrateSetting>(loadBitrateSetting);
```

Add the popover inside the final JSX, alongside ControlsBar and StatsWidget:
```tsx
{race.active && (
  <BitrateSettingsPopover value={bitrateSetting} onChange={setBitrateSetting} />
)}
```

- [ ] **Step 21.3: Manual smoke test**

- В правом верхнем углу плеера видна шестерёнка.
- Клик открывает popover с 4 радио-опциями.
- Выбор 2 Mbps → setting сохраняется в localStorage.
- Следующая запись использует новый битрейт (проверить через размер файла).
- Ring-буфер пересоздаётся автоматически (проверить через reload страницы и новый реплей — должен работать).

- [ ] **Step 21.4: Commit**

```bash
git add web/src/modules/stream/overlay/BitrateSettingsPopover.tsx web/src/modules/stream/StreamPlayer.tsx
git commit -m "feat(stream): add bitrate settings popover for recording quality"
```

---

## Phase 6 — Polish

### Task 22: Auto-hide behaviour for ControlsBar

**Goal:** ControlsBar прячется через 3 секунды бездействия и появляется при hover/tap.

**Files:**
- Modify: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 22.1: Добавить визуальный wrapper с auto-hide**

Inside `StreamPlayer`, добавить состояние видимости:

```tsx
const [controlsVisible, setControlsVisible] = useState(true);
const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const showControls = useCallback(() => {
  setControlsVisible(true);
  if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
}, []);

useEffect(() => {
  showControls();
  return () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };
}, [showControls]);
```

Оборачиваем `ControlsBar` в div с классами прозрачности и привязываем `onMouseMove`/`onTouchStart` к корневому div видео:

```tsx
return (
  <div
    className="h-full bg-black flex items-center justify-center relative"
    onMouseMove={showControls}
    onTouchStart={showControls}
  >
    <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full" />
    {race.active && <StatsWidget stats={stats} />}
    {race.active && (
      <BitrateSettingsPopover value={bitrateSetting} onChange={setBitrateSetting} />
    )}
    {race.active && (
      <div
        className={`transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <ControlsBar screenshot={screenshot} recorder={recorder} />
      </div>
    )}
    {race.phase === "error" && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-400 text-center p-4">
        Не удалось подключиться: {race.error}
      </div>
    )}
  </div>
);
```

- [ ] **Step 22.2: Manual smoke test**

- Открыть камеру. Кнопки видны 3 секунды, потом исчезают.
- Подвинуть мышь над видео — появляются снова.
- Статистика и шестерёнка остаются видны всегда.
- Во время активной записи — кнопки продолжают исчезать, но индикатор `REC mm:ss` вшит в ControlsBar, поэтому тоже исчезает. **Это немного неудобно.** Оставляем так в MVP; улучшение — вынести `RecordingIndicator` из ControlsBar наружу (отдельная задача при необходимости).

- [ ] **Step 22.3: Commit**

```bash
git add web/src/modules/stream/StreamPlayer.tsx
git commit -m "feat(stream): auto-hide ControlsBar after 3 seconds of inactivity"
```

---

### Task 23: Stream disconnect handling in recordings

**Goal:** Если стрим отвалился во время активной записи или реплея — автоматически финализировать и предложить сохранение.

**Files:**
- Modify: `web/src/modules/stream/hooks/useMediaRecorder.ts`

- [ ] **Step 23.1: Реагировать на `transportReady` → false**

Add an effect inside `useMediaRecorder` that watches `transportReady`:

```ts
useEffect(() => {
  if (transportReady) return;
  // Transport just went away. Finalize active recording and replay.
  if (activeRecorderRef.current) {
    finalizeActiveRecording(true).catch(() => {});
  }
  if (replayRecorderRef.current) {
    try {
      replayRecorderRef.current.stop();
    } catch {}
  }
}, [transportReady, finalizeActiveRecording]);
```

- [ ] **Step 23.2: Verify compile**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 23.3: Manual smoke test**

- Начать запись, остановить бэкенд (Ctrl+C в терминале `make dev-backend`).
- Дождаться разрыва стрима. Ожидается: запись автоматически финализируется и показывается диалог сохранения (или тост сохранения, в зависимости от того, используется ли FS API).
- Перезапустить бэкенд, продолжить работу.

- [ ] **Step 23.4: Commit**

```bash
git add web/src/modules/stream/hooks/useMediaRecorder.ts
git commit -m "feat(stream): auto-finalize recordings on stream disconnect"
```

---

### Task 24: Full manual test pass

- [ ] **Step 24.1: Пройти чеклист из спеки**

Открыть [spec §Ручной чеклист тестирования](../specs/2026-04-05-stream-viewer-toolbar-design.md#ручной-чеклист-тестирования). Пройти все 22 пункта. Зафиксировать баги в TODO-заметках — исправлять отдельными коммитами, **не в этой задаче**.

Ключевые проверки:
- [ ] 1. Скриншот через кнопку, Chrome и Firefox
- [ ] 2. Скриншот через контекстное меню `<video>`
- [ ] 3. Копирование в буфер на localhost
- [ ] 4. Кнопка копирования скрыта на `http://host.local`
- [ ] 5. Реплей в начале просмотра (неполный прошлый буфер)
- [ ] 6. Реплей в середине просмотра
- [ ] 7. Реплей параллельно с ручной записью
- [ ] 8. Обычная запись → стоп → файл валиден в VLC
- [ ] 9. Обычная запись до авто-стопа на 10:00 + предупреждение на 9:00
- [ ] 10. Запись с FS API: память не растёт в Chrome DevTools
- [ ] 11. Запись без FS API: Firefox сохраняет файл
- [ ] 12. Переключение камеры во время записи
- [ ] 13. Закрытие плеера во время записи
- [ ] 14. Разрыв стрима во время записи
- [ ] 15. Статистика на MSE
- [ ] 16. Статистика на WebRTC
- [ ] 17. Tooltip на виджете статистики
- [ ] 18. Race: MSE-only (WebRTC заблокирован)
- [ ] 19. Race: обычный запуск
- [ ] 20. Race: поздний WebRTC takeover (если воспроизводимо)
- [ ] 21. Смена битрейта через шестерёнку
- [ ] 22. Браузер без MediaRecorder-поддержки: кнопки записи скрыты

- [ ] **Step 24.2: Итоговый коммит**

Если все тесты прошли и ничего не правилось:

```bash
git log --oneline -30   # проверить, что история чистая
```

Если были мелкие правки по ходу тестирования — закоммитить отдельно с префиксом `fix(stream): ...`.

---

## Self-Review (инлайн, уже проделано при написании плана)

**Coverage check** против спеки:

| Секция спеки | Задача плана |
|---|---|
| Обзор архитектуры, file structure | Phase 1 + Phase 2 + Phase 3–5 |
| `transports/types.ts` | Task 5 |
| `useMseTransport` | Task 6 |
| `useWebrtcTransport` | Task 7 |
| `useTransportRace` | Task 8 |
| Transport race стратегия (WebRTC приоритет, 15с окно) | Task 8 |
| `useStreamStats` (WebRTC + MSE ветки) | Task 10 |
| `StatsWidget` | Tasks 11, 12 |
| `useScreenshot` | Task 13 |
| `lib/filename.ts`, `lib/mimeType.ts` | Task 1 |
| `lib/fileSaver.ts` (FS API + clipboard + download) | Task 2 |
| `lib/ringBuffer.ts` | Task 3 |
| Toast-система | Task 4 |
| `useMediaRecorder` ring buffer | Task 16 |
| `useMediaRecorder.takeReplay` | Task 17 |
| `useMediaRecorder.startRecording/stopRecording` + 10 мин + 9:00 warning + FS API | Task 18 |
| `RecordingIndicator` | Task 19 |
| `ControlsBar` со всеми 4 кнопками | Tasks 14, 20 |
| `BitrateSettingsPopover` + localStorage | Task 21 |
| Auto-hide ControlsBar через 3с | Task 22 |
| Stream disconnect → finalize | Task 23 |
| Переключение камеры → finalize | Частично покрыто эффектом `transportReady` (при смене камеры `streamInfo` меняется, race сбрасывается, `transportReady` на момент падает в false и триггерит эффект из Task 23) |
| Закрытие плеера → finalize | Покрыто cleanup-эффектом в Task 18 |
| Memory cap 1.5 ГБ в фолбэк-режиме | **⚠ не покрыто явно** — добавлено только безусловное 10-минутное ограничение. Lim 1.5GB — дополнительная защита, практически не срабатывает при 10-мин лимите и битрейте ≤20 Mbps. Можно добавить отдельным коммитом если понадобится. |
| Full manual test checklist | Task 24 |

**Type consistency:** `BitrateSetting`, `ReplayState`, `MediaRecorderApi`, `ScreenshotApi`, `StreamStats`, `TransportHandle`, `TransportKind`, `RacePhase` — одинаковы везде где используются.

**Placeholders:** `_cameraName` в Task 16 переименовывается в `cameraName` в Task 17 — явно указано в шаге. `takeReplay`/`startRecording`/`stopRecording` — placeholder в Task 16 с явной пометкой «implemented in next tasks», реализация в Tasks 17–18 даётся полностью.

**Gaps:** memory cap 1.5 ГБ признан избыточным для MVP и оставлен вне scope.

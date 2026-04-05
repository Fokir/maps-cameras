---
date: 2026-04-05
topic: Stream viewer toolbar — статистика, скриншот, реплей, запись, WebRTC-транспорт
status: approved
---

# Stream viewer toolbar

## Цель

Добавить на экран просмотра RTSP-стрима оверлей-инструментарий оператора:

1. **Виджет статистики** (правый нижний угол) — транспорт, bitrate, fps, потеря пакетов.
2. **Панель действий** (левый нижний угол) — скриншот в файл, копирование кадра в буфер обмена, instant replay (±10 секунд), ручная запись со стопом.
3. Как сопутствующая работа — реализация WebRTC-транспорта на фронтенде (сейчас используется только MSE) с race-стратегией «кто быстрее, тот показывает, но WebRTC в приоритете».

Фичи ориентированы на оператора мониторинга и соответствуют идее №9 из списка в обсуждении (health/observability) и выходу за её рамки в сторону оперативной работы с инцидентами.

## Ограничения и принципиальные решения

- **Всё клиентское.** Никаких изменений на Go-бэкенде не требуется; go2rtc уже умеет и MSE, и WebRTC. Серверный continuous-buffer для «instant replay» в go2rtc отсутствует, поэтому реплей можно реализовать только на клиенте через `MediaRecorder` + ring-буфер.
- **Кодировка записи.** `videoElement.captureStream()` отдаёт декодированные кадры, поэтому запись всегда **перекодируется** браузером. Формат определяется по `MediaRecorder.isTypeSupported` в порядке: `video/mp4;codecs=avc1` → `video/webm;codecs=vp9` → `video/webm;codecs=vp8` → `video/webm`. Расширение файла — `.mp4` или `.webm` по факту.
- **Битрейт записи — «авто» по умолчанию.** Берётся из измеренного `useStreamStats.bitrate`, ограничивается диапазоном `[1, 10] Mbps`. В UI плеера (шестерёнка) доступна ручная настройка `Авто / 2 / 4 / 8 Mbps`, хранится в `localStorage['maps-cameras.recordingBitrate']`.
- **Максимальная длительность ручной записи — 10 минут.** На 9-й минуте показывается тост-предупреждение, на 10-й минуте запись останавливается автоматически и предлагается сохранение.
- **File System Access API используется там, где доступен** (Chromium), с фолбэком на обычный download через `<a download>`. Для длинной записи это критично: на Chromium данные пишутся сразу на диск, память не растёт; на Firefox/Safari чанки копятся в памяти до конца записи с тем же лимитом 10 минут.
- **Копирование в буфер обмена** требует Secure Context (HTTPS или localhost). На `http://host.local:8080` API недоступно — кнопка копирования в этом случае **скрывается**, пользователь копирует кадр через нативное контекстное меню `<video>` или сохраняет как файл.
- **Переключение камеры во время активной записи** финализирует текущую запись и предлагает её сохранить. Единый файл, охватывающий несколько камер, не делается (отдельно рассмотрен и отклонён canvas-compositing подход).
- **Тесты — только ручные.** В проекте сейчас нет тест-фреймворка; добавлять vitest ради этой фичи — отдельная задача вне scope.

## Обзор архитектуры

```
web/src/modules/stream/
  StreamPlayer.tsx                   ← EDIT: выбирает транспорт, монтирует overlay
  MiniStreamPreview.tsx              ← не затрагивается
  streamApi.ts, streamStore.ts       ← не затрагиваются
  transports/
    types.ts                         ← NEW: TransportHandle интерфейс
    useMseTransport.ts               ← NEW: извлечён из текущего useEffect
    useWebrtcTransport.ts            ← NEW: WebRTC handshake + pc lifecycle
    useTransportRace.ts              ← NEW: объединяет оба и реализует race
  overlay/
    StreamOverlay.tsx                ← NEW: layout оверлея, auto-hide кнопок
    StatsWidget.tsx                  ← NEW: правый нижний, всегда видимый
    ControlsBar.tsx                  ← NEW: левый нижний, auto-hide
    BitrateSettingsPopover.tsx       ← NEW: попап от шестерёнки
    RecordingIndicator.tsx           ← NEW: REC mm:ss + пульсация
  hooks/
    useStreamStats.ts                ← NEW: стат-хук над TransportHandle
    useScreenshot.ts                 ← NEW: capture кадра, save, copy
    useMediaRecorder.ts              ← NEW: ring-буфер + активная запись
  lib/
    ringBuffer.ts                    ← NEW: deque чанков по времени
    fileSaver.ts                     ← NEW: File System Access API + download fallback
    filename.ts                      ← NEW: санитизация + шаблон имени
    mimeType.ts                      ← NEW: выбор поддерживаемого mimeType

web/src/shared/
  toast/                             ← NEW: минимальная тост-система
    ToastProvider.tsx
    useToast.ts
    Toast.tsx
```

**Границы ответственности:**

- **Транспорты** инкапсулируют WS/PC и экспортируют унифицированный `TransportHandle`. Ничего о UI и статистике не знают.
- **`useStreamStats`** работает только с `TransportHandle`, не знает про конкретный транспорт.
- **`useMediaRecorder`** работает с `HTMLVideoElement` и параметрами (битрейт, имя камеры), не знает про транспорт.
- **Overlay-компоненты** читают данные из хуков и стора, внутренней логики «как это измерено» не содержат.

## Компоненты и модули

### `transports/types.ts`

```ts
export type TransportKind = 'webrtc' | 'mse';

export interface TransportHandle {
  kind: TransportKind;
  /** Монотонный счётчик принятых байт, используется для bitrate-расчёта. */
  getBytesReceived(): number;
  /** Для WebRTC — настоящий pc, чтобы useStreamStats мог вызвать getStats(). */
  peerConnection?: RTCPeerConnection;
  /** MIME-строка текущего видео-кодека, например 'avc1.640029' или 'h264'. */
  videoCodec: string | null;
  /** Вызвать, чтобы корректно свернуть транспорт. */
  dispose(): void;
}
```

### `transports/useMseTransport.ts`

Извлекает текущую реализацию из `StreamPlayer.tsx` в отдельный хук. Сигнатура:

```ts
function useMseTransport(
  videoEl: HTMLVideoElement | null,
  wsUrl: string | null,
  onReady: (handle: TransportHandle) => void,
  onError: (err: Error) => void,
): void;
```

`onReady` вызывается, когда получен первый не-пустой чанк и `SourceBuffer` готов воспроизводить. `getBytesReceived` инкрементируется в `ws.onmessage` по `event.data.byteLength`. `videoCodec` берётся из строки, которую вернул go2rtc в ответ `{type: 'mse', value: '...'}`. Логика очистки: закрытие WS, `mediaSource.endOfStream()`, обнуление `video.src`.

### `transports/useWebrtcTransport.ts`

Новая реализация. Сигнатура аналогична MSE:

```ts
function useWebrtcTransport(
  videoEl: HTMLVideoElement | null,
  webrtcWsUrl: string | null,
  onReady: (handle: TransportHandle) => void,
  onError: (err: Error) => void,
): void;
```

**Последовательность:**

1. Открываем WS на `webrtcWsUrl` (это `streamInfo.webrtc_url` из `StreamInfo`, проксируется через бэкенд на go2rtc).
2. Создаём `new RTCPeerConnection()` с дефолтными настройками (пустой `iceServers`: мы в локальной сети).
3. Добавляем recv-only трансиверы: `pc.addTransceiver('video', {direction: 'recvonly'})` и `'audio'`.
4. `offer = await pc.createOffer()` → `pc.setLocalDescription(offer)` → `ws.send(JSON.stringify({type: 'webrtc/offer', value: offer.sdp}))`.
5. На сообщение `{type: 'webrtc/answer', value: sdp}` — `pc.setRemoteDescription({type: 'answer', sdp})`.
6. На `{type: 'webrtc/candidate', value: cand}` — `pc.addIceCandidate(...)`.
7. На локальный `pc.onicecandidate` — отправляем `{type: 'webrtc/candidate', value: event.candidate.candidate}`.
8. `pc.ontrack` → берём видеотрек, формируем `new MediaStream([track])`, кладём в `videoEl.srcObject`, дожидаемся `loadeddata` → вызываем `onReady`.
9. `getBytesReceived` реализуется через периодический `pc.getStats()` и чтение `bytesReceived` из `inbound-rtp` отчёта. Внутри транспорта держим кеш последнего значения, хук `useStreamStats` читает его без повторного вызова `getStats`.
10. `videoCodec` — из `codec` отчёта (`mimeType`).

**Примечание о формате сигналинга.** Точные имена типов (`webrtc/offer` vs `webrtc`) зависят от версии go2rtc, развёрнутой у пользователя. При имплементации — свериться с исходниками текущей версии go2rtc и убедиться, что наш Go-бэкенд пробрасывает сообщения без трансформации. Если трансформация есть — запланировать правку в `internal/stream/`.

### `transports/useTransportRace.ts`

Координатор. Одновременно стартует оба транспорта, выбирает победителя по правилам из секции «Стратегия race ниже». Наружу экспортирует:

```ts
function useTransportRace(videoEl, streamInfo): {
  active: TransportHandle | null;
  phase: 'connecting' | 'mse' | 'webrtc' | 'error';
  error: string | null;
};
```

### `hooks/useStreamStats.ts`

```ts
function useStreamStats(
  transport: TransportHandle | null,
  videoEl: HTMLVideoElement | null,
): StreamStats;

type StreamStats = {
  transport: TransportKind | null;
  bitrate: number | null;        // bits per second, null до первого измерения
  fps: number | null;
  loss: number | null;           // null для MSE
  resolution: { w: number; h: number } | null;
  codec: string | null;
  jitterMs: number | null;       // null для MSE
  receivedBytes: number;
};
```

Обновление раз в секунду через `setInterval`. Реализация:

- **WebRTC:** `await transport.peerConnection.getStats()` → ищем `type === 'inbound-rtp' && kind === 'video'`. Поля: `bytesReceived`, `framesPerSecond` (или дельта `framesDecoded`), `packetsLost`, `packetsReceived`, `jitter`, `frameWidth`, `frameHeight`. Codec — через связанный `type === 'codec'` отчёт по `codecId`.
- **MSE:** `bitrate` по дельте `transport.getBytesReceived()`. `fps` по дельте `videoEl.getVideoPlaybackQuality().totalVideoFrames`. `resolution` из `videoEl.videoWidth/videoHeight`. `codec` из `transport.videoCodec`. `loss` и `jitterMs` остаются `null`.

Первые 2 секунды все числовые поля могут быть `null` — UI показывает `—`. При возврате `null` из `getStats` (не удалось) — держим последние известные значения ещё 3 секунды, потом сбрасываем.

### `hooks/useScreenshot.ts`

```ts
function useScreenshot(videoEl: HTMLVideoElement | null, cameraName: string): {
  saveToFile(): Promise<void>;
  copyToClipboard(): Promise<void>;
  canCopy: boolean;               // false если !isSecureContext
  isReady: boolean;               // videoEl.readyState >= 2
};
```

Общая функция `captureFrame()` создаёт временный canvas размером `videoEl.videoWidth × videoEl.videoHeight`, рисует кадр, возвращает PNG `Blob`. `saveToFile` передаёт в `fileSaver.download`. `copyToClipboard` — `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`.

### `hooks/useMediaRecorder.ts`

```ts
function useMediaRecorder(
  videoEl: HTMLVideoElement | null,
  transportReady: boolean,
  cameraName: string,
  measuredBitrate: number | null,
): {
  // Instant replay (всегда можно, пока открыт плеер)
  takeReplay(): Promise<void>;
  replayState: 'idle' | 'capturing';    // capturing = 10 сек ожидания +10с

  // Manual recording
  isRecording: boolean;
  recordingSeconds: number;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
};
```

**Внутренняя структура:**

- `bufferRecorder` — `MediaRecorder` на `videoEl.captureStream()`, всегда активен, пока `transportReady === true`. Чанки по 500 мс идут в `RingBuffer` с retention 10 секунд. Пересоздаётся при смене `measuredBitrate` или пользовательской настройки.
- `replayRecorder` — создаётся при `takeReplay()`, пишет 10 секунд «будущего», потом конкатенируется с `bufferRecorder.snapshot()` в один Blob. Сохраняется через `fileSaver.download`.
- `activeRecorder` — создаётся при `startRecording()`. Если доступен File System Access API, перед стартом запрашивает handle через `showSaveFilePicker`, пишет чанки прямо в `WritableStream`. Иначе копит `chunks: Blob[]` в памяти. Останавливается по `stopRecording()`, по таймауту 10 минут, при размонтировании плеера, при переключении камеры, при разрыве стрима. На каждом стопе — если >1 сек, сохраняется.

**Ограничения памяти для фолбэк-режима:**

- Чанки идут по 1 сек.
- На 9:00 — вызов `toast.warn('Запись остановится через 60 сек')`.
- На 10:00 — авто-стоп + сохранение.
- Дополнительный safeguard: если `chunks.reduce((s, c) => s + c.size, 0) > 1_500_000_000` (1.5 ГБ) — авто-стоп раньше с тостом «Запись остановлена: достигнут лимит памяти».

### `overlay/StreamOverlay.tsx`

Абсолютный оверлей над `<video>`. Layout:

```
┌─────────────────────────────────────────────────────┐
│                                                 ⚙  │  ← BitrateSettingsPopover
│                                                     │
│                                                     │
│                   (video area)                      │
│                                                     │
│                                                     │
│ [📷][📋][🐇 Реплей][⏺/⏹]      REC 02:15           │
│                              MSE                    │
│                              Bitrate: 3.2 Mbps      │
│                              FPS: 25                │
│                              Loss: —                │
└─────────────────────────────────────────────────────┘
```

- Верхний правый ⚙ — всегда видимый.
- Нижняя левая панель кнопок — auto-hide через 3 секунды бездействия (mouseover/touch сбрасывает таймер).
- Нижний правый виджет статистики — всегда видимый.
- Индикатор активной записи `REC mm:ss` появляется рядом с кнопкой записи, цвет таймера зелёный → оранжевый (после 9:00) → красный мигающий (после 9:30).

На мобильных: размеры кнопок 44×44 px, тап по видео тоггл видимости панели.

### `overlay/StatsWidget.tsx`

Четыре строки моноширинного шрифта на полупрозрачном фоне, обновление раз в секунду. Формат:

```
WebRTC                     (или MSE)
Bitrate: 3.2 Mbps          (или —)
FPS:     25                (или —)
Loss:    0.1%              (или —)
```

При `null` в любом поле показывается `—`. На hover — tooltip с `{resolution} · {codec} · jitter {N} ms · received {N} MB`.

### `overlay/ControlsBar.tsx`

Четыре кнопки слева направо:

1. **Screenshot** (`Camera` icon) — вызывает `useScreenshot.saveToFile()`. Disabled если `!isReady`.
2. **Copy frame** (`Clipboard` icon) — вызывает `useScreenshot.copyToClipboard()`. **Скрыта целиком**, если `!canCopy` (т.е. `!isSecureContext`).
3. **Replay** (`Rabbit` icon, зелёная, подпись «Реплей») — вызывает `useMediaRecorder.takeReplay()`. Во время `replayState === 'capturing'` заменяется на лоадер, кнопка disabled.
4. **Record/Stop** (красный кружок → красный квадрат) — toggle `startRecording`/`stopRecording`. Disabled если `!transportReady || !isReady`.

### `overlay/BitrateSettingsPopover.tsx`

Попап от ⚙ с radio-списком:

```
● Авто (рекомендуется)
○ 2 Mbps — низкое качество
○ 4 Mbps — среднее
○ 8 Mbps — высокое
```

Сохраняет выбор в `localStorage['maps-cameras.recordingBitrate']`. Применяется к **следующим** создаваемым записям (активная запись продолжает со своим битрейтом); `bufferRecorder` пересоздаётся сразу.

### `overlay/RecordingIndicator.tsx`

Компактный компонент: красный кружок с CSS-анимацией `pulse` + текст `REC 02:15`. Монтируется `ControlsBar` когда `isRecording === true`.

### `lib/ringBuffer.ts`

```ts
class RingBuffer<T extends {size: number; timestamp: number}> {
  constructor(retentionMs: number);
  push(item: T): void;              // удаляет всё старше now - retentionMs
  snapshot(): T[];                  // копия текущего содержимого
  clear(): void;
  totalSize(): number;              // сумма item.size
}
```

Чистая утилита, без React, тривиально тестируется (когда тесты появятся).

### `lib/fileSaver.ts`

```ts
export async function download(blob: Blob, filename: string): Promise<void>;
export function openWritableStream(filename: string): Promise<FileSystemWritableFileStream | null>;
export function hasClipboardImageSupport(): boolean;
```

- `download`: если есть `showSaveFilePicker`, открывает нативный диалог с `suggestedName`; иначе `URL.createObjectURL` + `<a download>`.
- `openWritableStream`: возвращает writable handle для длинной записи, или `null` если API недоступен (фолбэк на in-memory).
- `hasClipboardImageSupport`: `window.isSecureContext && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined'`.

### `lib/filename.ts`

```ts
export function buildFilename(cameraName: string, ext: string, date = new Date()): string;
```

Формат: `{sanitized_camera_name}_{YYYY-MM-DD}_{HH-MM-SS}.{ext}`.

Санитизация: символы `<>:"/\|?*` заменяются на `_`; также управляющие символы `\x00-\x1f`; ведущие/замыкающие пробелы и точки обрезаются; пустое имя становится `camera`.

Пример: `Вход № 1` + `.webm` → `Вход № 1_2026-04-05_14-32-07.webm`.

### `lib/mimeType.ts`

```ts
export function pickRecordingMimeType(): {mimeType: string; ext: string} | null;
```

Идёт по списку:

1. `'video/mp4;codecs=avc1'`
2. `'video/webm;codecs=vp9'`
3. `'video/webm;codecs=vp8'`
4. `'video/webm'`

Возвращает первый, где `MediaRecorder.isTypeSupported(x) === true`, и соответствующее расширение (`.mp4` или `.webm`). `null` — если ни один не поддерживается (тогда UI-кнопки записи скрываются).

### `shared/toast/`

Минимальная тост-система. Причина: в проекте её нет, а нам нужны уведомления для 7+ сценариев. Состав:

- `ToastProvider` — React context + рендер очереди.
- `useToast()` → `{success, error, warn, info}`.
- `Toast.tsx` — визуальный компонент, тёмная плашка внизу экрана, auto-dismiss через 4 секунды, поддержка `action` (кнопка «отменить» — пока не используется, задел).

Монтируется в корне приложения (где живёт `App.tsx` / `layout.tsx`).

## Стратегия транспортного race

**Состояния плеера:**

```ts
type Phase = 'connecting' | 'mse' | 'webrtc' | 'error';
```

**Правила:**

1. При получении `streamInfo` (из `streamStore`) одновременно стартуют `useMseTransport` и `useWebrtcTransport`.
2. Оба транспорта вызывают свой `onReady` независимо. `useTransportRace` следит за тем, кто первый.
3. Если первым готов **WebRTC**: `phase = 'webrtc'`, MSE-транспорт немедленно закрывается через `dispose()`.
4. Если первым готов **MSE**: `phase = 'mse'`, WebRTC продолжает пытаться в течение **15 секунд** с момента старта race.
5. Если во время этого окна WebRTC становится готов — принудительное переключение: `videoEl.src = ''`, `videoEl.srcObject = webrtcStream`, старый `bufferRecorder` останавливается и пересоздаётся, `phase = 'webrtc'`. MSE `dispose()`. Пользователь видит короткий чёрный кадр.
6. По истечении 15-секундного окна WebRTC принудительно закрывается, остаёмся на MSE до конца сессии.
7. Если оба упали — `phase = 'error'`, показываем текст ошибки.
8. Обратного перехода `webrtc → mse` нет.

**Обоснование 15 секунд:** WebRTC handshake обычно занимает 100–500 мс в локальной сети. Если он не пришёл за 15 секунд, с большой вероятностью что-то сломано (кодек не поддерживается, go2rtc не может его сформировать, сетевая проблема), и бесконечно держать WS с сервером нет смысла.

**Влияние на запись и ring-буфер:**

- `bufferRecorder` инициализируется **после** того, как `phase !== 'connecting'`.
- При переходе `mse → webrtc` `bufferRecorder` уничтожается и создаётся заново на новом MediaStream. Ring-буфер прошлого при этом сбрасывается. Это приемлемо: переход случается в первые 15 секунд, когда пользователь вряд ли успеет нажать «реплей».
- Активная ручная запись в эти 15 секунд крайне маловероятна (пользователь только что открыл плеер), но если каким-то образом она началась на MSE и затем WebRTC догнал — запись **финализируется на MSE**, пользователю предлагается сохранить что есть, и дальше новая запись уже пойдёт с WebRTC.

## Поток данных

```
streamStore.streamInfo
          │
          ▼
   StreamPlayer.tsx
          │
          ├──► useTransportRace ──► { phase, active: TransportHandle }
          │                              │
          ▼                              │
      <video ref/>                       │
          ▲                              │
          │                              │
          ├──────────────────────────────┤
          │                              │
          ├──► useStreamStats(active, videoEl) ──► StatsWidget
          │
          ├──► useScreenshot(videoEl, cameraName) ──► ControlsBar [📷][📋]
          │
          ├──► useMediaRecorder(videoEl, phase, cameraName, stats.bitrate)
          │                                                    │
          │                                                    ├──► ControlsBar [🐇][⏺]
          │                                                    └──► RecordingIndicator
          │
          └──► BitrateSettingsPopover (читает/пишет localStorage, влияет на useMediaRecorder)
```

Имя камеры для построения имени файла: `useCameraStore.cameras.find(c => c.id === useStreamStore.activeCameraId)?.name`.

## Обработка ошибок

| Ситуация | Поведение |
|---|---|
| Оба транспорта упали | `phase = 'error'`, сообщение поверх плеера, кнопки скрыты |
| `MediaRecorder` не поддерживает ни один mimeType | `useMediaRecorder` возвращает флаг `supported: false`, кнопки записи и реплея скрываются, tooltip на месте: «Браузер не поддерживает запись» |
| `captureStream()` бросает exception | То же |
| `showSaveFilePicker` отменён пользователем | Тихо, без тоста ошибки |
| `clipboard.write` permission denied | Тост `error` «Нет доступа к буферу обмена» |
| `canvas.toBlob` вернул null | Тост `error` «Не удалось создать скриншот» |
| Стрим отвалился во время ручной записи | Авто-стоп; если записано >1 сек — диалог сохранения + тост `info` «Запись сохранена (N сек)» |
| Стрим отвалился во время replay capture | Реплей финализируется с тем, что удалось собрать; если итоговый blob пуст — тост `error` |
| Переключение камеры во время записи | Текущая запись финализируется + диалог сохранения; ring-буфер новой камеры стартует с нуля |
| Закрытие плеера с активной записью | Модалка-подтверждение «Сохранить незавершённую запись?»; при отказе — выброс |
| Лимит памяти 1.5 ГБ в фолбэк-режиме | Авто-стоп + тост `warn` «Запись остановлена: достигнут лимит памяти» + диалог сохранения |
| На 9:00 при обычной записи | Тост `warn` «Запись остановится через 60 сек» |
| На 10:00 | Авто-стоп + диалог сохранения + тост `info` «Достигнут лимит 10 минут» |

## Ключевые UX-детали

- Статистика **всегда видна**; кнопки **auto-hide** через 3 секунды бездействия, появляются по hover/tap.
- Индикатор записи `REC mm:ss` — зелёный до 9:00, оранжевый 9:00–9:30, красный мигающий 9:30–10:00.
- Скриншоты и реплей доступны во время активной ручной записи без ограничений.
- Настройка битрейта применяется к **следующим** создаваемым записям (активная продолжает со своим); ring-буфер пересоздаётся сразу.
- Формат имени файла: `{имя камеры}_{YYYY-MM-DD}_{HH-MM-SS}.{ext}`.

## Ручной чеклист тестирования

1. Скриншот через кнопку `📷` (проверить Chromium с FS API и Firefox без него).
2. Скриншот через нативное контекстное меню `<video>` — проверить, что тоже работает.
3. Копирование в буфер на `http://localhost` и `https://...` — работает.
4. Копирование в буфер на `http://host.local` — кнопка **скрыта**.
5. Реплей сразу после открытия плеера (прошлого буфера мало).
6. Реплей в середине просмотра (полные 10 секунд прошлого).
7. Реплей параллельно с активной ручной записью — оба файла валидны.
8. Ручная запись 1 минута → стоп → сохранение → проверка в VLC.
9. Ручная запись до авто-стопа на 10:00 — проверить тост на 9:00 и корректное сохранение.
10. Ручная запись с FS API (Chromium): выбрать файл через диалог, посмотреть, что память браузера не растёт через `about:performance` / DevTools Memory.
11. Ручная запись без FS API (Firefox): проверить, что 10-минутный файл сохраняется через обычный download.
12. Запись и последующее переключение камеры — текущая финализируется, диалог сохранения.
13. Запись и закрытие плеера — модалка «сохранить?».
14. Запись с разрывом стрима в середине — авто-стоп и сохранение.
15. Статистика на MSE: проверить bitrate, fps, `Loss: —`, транспорт `MSE`.
16. Статистика на WebRTC: проверить bitrate, fps, loss, jitter, транспорт `WebRTC`.
17. Hover на виджете статистики — tooltip с resolution/codec/jitter/received.
18. Race: временно замедлить WebRTC (например, закрыть 1984/UDP) — должен отыграть MSE без щелчка.
19. Race: обычный запуск — в идеале сразу WebRTC, без MSE-вспышки.
20. Race: если MSE успел заиграть раньше, а потом пришёл WebRTC — должен произойти свич с коротким чёрным кадром.
21. Настройка битрейта через ⚙: выбрать `2 Mbps`, сделать запись, проверить размер файла примерно соответствует.
22. Ошибочный сценарий: браузер, где `MediaRecorder` не поддерживает видео → кнопки записи скрыты, tooltip.

## Что НЕ делаем в этой работе (out of scope)

- Добавление тест-фреймворка (vitest/jest) и автотестов.
- Canvas-compositing для непрерывной записи через несколько камер.
- Серверный continuous-buffer для replay.
- HTTPS-сертификаты / Secure Context для деплоя.
- Настройки хранения записей на сервере.
- Улучшение существующей обработки ошибок MSE за пределами интерфейса `TransportHandle`.
- PTZ, heatmap, другие фичи из первоначального списка идей.

## Открытые вопросы на этап имплементации

1. **Точный формат сообщений сигналинга go2rtc.** Свериться с версией go2rtc на сервере пользователя и исходниками `internal/stream/` бэкенда. Возможно потребуется правка прокси, если он что-то преобразует.
2. **Поведение `captureStream()` на `<video>` c `srcObject = MediaStream`** (WebRTC-ветка) — проверить на целевых браузерах, что треки корректно прокидываются в `MediaRecorder`. В Chromium это штатно, в Firefox есть нюансы.
3. **Конкатенация WebM-чанков через `new Blob([...])`** — проверить валидность итогового файла на тестовых записях; если плееры капризничают, подключить `fix-webm-duration` или аналог.

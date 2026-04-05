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

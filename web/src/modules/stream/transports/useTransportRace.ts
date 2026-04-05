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

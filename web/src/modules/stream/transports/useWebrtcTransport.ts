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

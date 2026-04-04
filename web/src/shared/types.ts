export interface Camera {
  id: string;
  name: string;
  rtsp_url: string;
  color: string;
  lat: number | null;
  lng: number | null;
  rotation: number;
  angle: number;
  distance: number;
  created_at: string;
  updated_at: string;
}

export type AppMode = "view" | "edit";

export interface MapConfig {
  center: [number, number];
  zoom: number;
}

export interface StreamInfo {
  stream_name: string;
  webrtc_url: string;
  ws_url: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

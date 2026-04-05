import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Camera } from "@/shared/types";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useHistoryStore } from "@/modules/editor/historyStore";

interface Props {
  camera: Camera;
}

function offsetLatLng(
  origin: L.LatLng,
  bearingDeg: number,
  distanceMeters: number
): L.LatLng {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(rad)) / 111320;
  const dLng =
    (distanceMeters * Math.sin(rad)) /
    (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return L.latLng(origin.lat + dLat, origin.lng + dLng);
}

function bearing(origin: L.LatLng, target: L.LatLng): number {
  const dLat = target.lat - origin.lat;
  const dLng =
    (target.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180);
  let deg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function buildConePoints(
  origin: L.LatLng,
  rotation: number,
  angle: number,
  distance: number
): L.LatLng[] {
  const start = rotation - angle / 2;
  const end = rotation + angle / 2;
  const steps = Math.max(8, Math.ceil(angle / 5));
  const points: L.LatLng[] = [origin];
  for (let i = 0; i <= steps; i++) {
    const a = start + (end - start) * (i / steps);
    points.push(offsetLatLng(origin, a, distance));
  }
  points.push(origin);
  return points;
}

export function CameraControls({ camera }: Props) {
  const map = useMap();
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);

  // Live state during drag (not synced to React store until dragend).
  const stateRef = useRef({
    lat: camera.lat!,
    lng: camera.lng!,
    rotation: camera.rotation,
    angle: camera.angle,
    distance: camera.distance,
  });

  // Stable refs for Leaflet objects so we can mutate them directly.
  const coneRef = useRef<L.Polygon | null>(null);
  const cameraMarkerRef = useRef<L.Marker | null>(null);
  const rotateHandleRef = useRef<L.Marker | null>(null);
  const angleTopRef = useRef<L.Marker | null>(null);
  const angleBottomRef = useRef<L.Marker | null>(null);
  const distHandleRef = useRef<L.Marker | null>(null);

  // Which marker is currently being dragged — skip updating its latlng/icon
  // because setLatLng/setIcon on a marker mid-drag breaks the native drag state.
  const draggingRef = useRef<L.Marker | null>(null);

  // Sync state from props when the camera id or base values change from outside.
  // Skip entirely while a drag is in progress (the drag is authoritative).
  useEffect(() => {
    if (draggingRef.current) return;
    stateRef.current = {
      lat: camera.lat!,
      lng: camera.lng!,
      rotation: camera.rotation,
      angle: camera.angle,
      distance: camera.distance,
    };
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id, camera.lat, camera.lng, camera.rotation, camera.angle, camera.distance, camera.color]);

  const redraw = () => {
    const { lat, lng, rotation, angle, distance } = stateRef.current;
    const origin = L.latLng(lat, lng);
    const dragging = draggingRef.current;

    if (coneRef.current) {
      coneRef.current.setLatLngs(buildConePoints(origin, rotation, angle, distance));
      coneRef.current.setStyle({
        fillColor: camera.color,
        color: camera.color,
      });
    }
    if (cameraMarkerRef.current && cameraMarkerRef.current !== dragging) {
      cameraMarkerRef.current.setLatLng(origin);
      cameraMarkerRef.current.setIcon(
        L.divIcon({
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          html: `<div style="
            width:20px;height:20px;background:${camera.color};
            border-radius:50%;border:3px solid #e0af68;
            box-shadow: 0 0 10px ${camera.color};
            cursor:move;
          "></div>`,
        })
      );
    }
    if (rotateHandleRef.current && rotateHandleRef.current !== dragging) {
      rotateHandleRef.current.setLatLng(offsetLatLng(origin, rotation, distance * 0.6));
    }
    if (angleTopRef.current && angleTopRef.current !== dragging) {
      angleTopRef.current.setLatLng(offsetLatLng(origin, rotation - angle / 2, distance));
    }
    if (angleBottomRef.current && angleBottomRef.current !== dragging) {
      angleBottomRef.current.setLatLng(offsetLatLng(origin, rotation + angle / 2, distance));
    }
    if (distHandleRef.current && distHandleRef.current !== dragging) {
      distHandleRef.current.setLatLng(offsetLatLng(origin, rotation, distance));
    }
  };

  useEffect(() => {
    if (camera.lat == null || camera.lng == null) return;

    const initial = {
      lat: camera.lat,
      lng: camera.lng,
      rotation: camera.rotation,
      angle: camera.angle,
      distance: camera.distance,
    };
    stateRef.current = initial;
    const origin = L.latLng(initial.lat, initial.lng);
    let snapshotTaken = false;
    const snapshotOnce = () => {
      if (!snapshotTaken) {
        pushSnapshot(useCameraStore.getState().cameras);
        snapshotTaken = true;
      }
    };

    // --- Cone polygon ---
    coneRef.current = L.polygon(
      buildConePoints(origin, initial.rotation, initial.angle, initial.distance),
      {
        fillColor: camera.color,
        color: camera.color,
        fillOpacity: 0.25,
        weight: 2,
        interactive: false,
      }
    ).addTo(map);

    // --- Helper to build a draggable handle ---
    const makeHandle = (
      position: L.LatLng,
      html: string,
      onDrag: (latlng: L.LatLng) => void
    ) => {
      const icon = L.divIcon({
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        html,
      });
      const marker = L.marker(position, {
        icon,
        draggable: true,
        autoPan: false,
      }).addTo(map);

      marker.on("dragstart", () => {
        draggingRef.current = marker;
        snapshotOnce();
      });
      marker.on("drag", (e: L.LeafletEvent) => {
        const ll = (e.target as L.Marker).getLatLng();
        onDrag(ll);
        redraw();
      });
      marker.on("dragend", () => {
        draggingRef.current = null;
        const s = stateRef.current;
        updateCamera(camera.id, {
          ...camera,
          lat: s.lat,
          lng: s.lng,
          rotation: s.rotation,
          angle: s.angle,
          distance: s.distance,
        });
        snapshotTaken = false;
        // Re-sync marker positions now that the drag is complete
        redraw();
      });
      return marker;
    };

    // --- Camera icon (position + click) ---
    cameraMarkerRef.current = makeHandle(
      origin,
      `<div style="
        width:20px;height:20px;background:${camera.color};
        border-radius:50%;border:3px solid #e0af68;
        box-shadow: 0 0 10px ${camera.color};
        cursor:move;
      "></div>`,
      (ll) => {
        stateRef.current.lat = ll.lat;
        stateRef.current.lng = ll.lng;
      }
    );
    cameraMarkerRef.current.on("dblclick", (e) => {
      L.DomEvent.stopPropagation(e);
      const s = stateRef.current;
      map.setView(L.latLng(s.lat, s.lng), map.getZoom(), { animate: true });
    });

    // --- Rotation handle (purple, midway along the cone axis) ---
    rotateHandleRef.current = makeHandle(
      offsetLatLng(origin, initial.rotation, initial.distance * 0.6),
      `<div style="
        width:14px;height:14px;background:#bb9af7;
        border-radius:50%;border:2px solid #fff;
        cursor:grab;box-shadow:0 0 6px #bb9af7;
      " title="Поворот"></div>`,
      (ll) => {
        const s = stateRef.current;
        const o = L.latLng(s.lat, s.lng);
        s.rotation = bearing(o, ll);
      }
    );

    // --- Angle handles (amber, top/bottom cone edges) ---
    angleTopRef.current = makeHandle(
      offsetLatLng(origin, initial.rotation - initial.angle / 2, initial.distance),
      `<div style="
        width:14px;height:14px;background:#e0af68;
        border-radius:50%;border:2px solid #fff;cursor:pointer;
      " title="Угол обзора"></div>`,
      (ll) => {
        const s = stateRef.current;
        const o = L.latLng(s.lat, s.lng);
        const b = bearing(o, ll);
        let delta = ((s.rotation - b + 540) % 360) - 180;
        const newAngle = Math.max(10, Math.min(180, Math.abs(delta) * 2));
        s.angle = newAngle;
      }
    );

    angleBottomRef.current = makeHandle(
      offsetLatLng(origin, initial.rotation + initial.angle / 2, initial.distance),
      `<div style="
        width:14px;height:14px;background:#e0af68;
        border-radius:50%;border:2px solid #fff;cursor:pointer;
      " title="Угол обзора"></div>`,
      (ll) => {
        const s = stateRef.current;
        const o = L.latLng(s.lat, s.lng);
        const b = bearing(o, ll);
        let delta = ((b - s.rotation + 540) % 360) - 180;
        const newAngle = Math.max(10, Math.min(180, Math.abs(delta) * 2));
        s.angle = newAngle;
      }
    );

    // --- Distance handle (blue, far edge) ---
    distHandleRef.current = makeHandle(
      offsetLatLng(origin, initial.rotation, initial.distance),
      `<div style="
        width:14px;height:14px;background:#7aa2f7;
        border-radius:50%;border:2px solid #fff;cursor:pointer;
      " title="Дистанция"></div>`,
      (ll) => {
        const s = stateRef.current;
        const o = L.latLng(s.lat, s.lng);
        s.distance = Math.max(5, o.distanceTo(ll));
      }
    );

    return () => {
      [
        coneRef.current,
        cameraMarkerRef.current,
        rotateHandleRef.current,
        angleTopRef.current,
        angleBottomRef.current,
        distHandleRef.current,
      ].forEach((m) => m?.remove());
      coneRef.current = null;
      cameraMarkerRef.current = null;
      rotateHandleRef.current = null;
      angleTopRef.current = null;
      angleBottomRef.current = null;
      distHandleRef.current = null;
    };
    // Only recreate when the camera identity changes — not on every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, camera.id]);

  return null;
}

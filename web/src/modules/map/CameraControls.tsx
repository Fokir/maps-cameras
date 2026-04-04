import { useEffect, useRef, useCallback } from "react";
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
  angleDeg: number,
  distanceMeters: number
): L.LatLng {
  const rad = (angleDeg * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(rad)) / 111320;
  const dLng =
    (distanceMeters * Math.sin(rad)) /
    (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return L.latLng(origin.lat + dLat, origin.lng + dLng);
}

export function CameraControls({ camera }: Props) {
  const map = useMap();
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const cameras = useCameraStore((s) => s.cameras);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);
  const markersRef = useRef<L.Marker[]>([]);
  const snapshotPushed = useRef(false);

  const origin = L.latLng(camera.lat!, camera.lng!);

  const pushOnce = useCallback(() => {
    if (!snapshotPushed.current) {
      pushSnapshot(cameras);
      snapshotPushed.current = true;
    }
  }, [cameras, pushSnapshot]);

  useEffect(() => {
    snapshotPushed.current = false;
  }, [camera.id]);

  useEffect(() => {
    if (camera.lat == null || camera.lng == null) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const createHandle = (
      position: L.LatLng,
      color: string,
      onDrag: (latlng: L.LatLng) => void,
      onDragEnd: () => void
    ) => {
      const icon = L.divIcon({
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid #fff;cursor:pointer;"></div>`,
      });
      const marker = L.marker(position, { icon, draggable: true }).addTo(map);
      marker.on("drag", (e: any) => {
        pushOnce();
        onDrag(e.target.getLatLng());
      });
      marker.on("dragend", onDragEnd);
      markersRef.current.push(marker);
      return marker;
    };

    // Angle handles (top and bottom edges of cone)
    const topAngle = camera.rotation - camera.angle / 2;
    const bottomAngle = camera.rotation + camera.angle / 2;
    const topPos = offsetLatLng(origin, topAngle, camera.distance);
    const bottomPos = offsetLatLng(origin, bottomAngle, camera.distance);

    createHandle(
      topPos,
      "#e0af68",
      (latlng) => {
        const dx = latlng.lng - origin.lng;
        const dy = latlng.lat - origin.lat;
        const newAngleDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
        const diff = Math.abs(camera.rotation - newAngleDeg) * 2;
        const clampedAngle = Math.max(10, Math.min(180, diff));
        updateCamera(camera.id, { ...camera, angle: clampedAngle });
      },
      () => { snapshotPushed.current = false; }
    );

    createHandle(
      bottomPos,
      "#e0af68",
      (latlng) => {
        const dx = latlng.lng - origin.lng;
        const dy = latlng.lat - origin.lat;
        const newAngleDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
        const diff = Math.abs(newAngleDeg - camera.rotation) * 2;
        const clampedAngle = Math.max(10, Math.min(180, diff));
        updateCamera(camera.id, { ...camera, angle: clampedAngle });
      },
      () => { snapshotPushed.current = false; }
    );

    // Distance handle (middle of far edge)
    const distPos = offsetLatLng(origin, camera.rotation, camera.distance);

    createHandle(
      distPos,
      "#7aa2f7",
      (latlng) => {
        const dist = origin.distanceTo(latlng);
        updateCamera(camera.id, { ...camera, distance: Math.max(5, dist) });
      },
      () => { snapshotPushed.current = false; }
    );

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [map, camera, origin, pushOnce, updateCamera]);

  return null;
}

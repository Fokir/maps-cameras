import { Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { Camera } from "@/shared/types";

interface CameraMarkerProps {
  camera: Camera;
  isActive: boolean;
  isEditing?: boolean;
  /** If false, the cone polygon ignores pointer events (useful in edit mode
   * where the cone can overlap draggable handles of the selected camera). */
  coneInteractive?: boolean;
  onClick: (id: string) => void;
  onPositionChange?: (id: string, lat: number, lng: number) => void;
}

function createCameraIcon(color: string, isActive: boolean): L.DivIcon {
  const size = isActive ? 18 : 14;
  const border = isActive ? `3px solid #e0af68` : `2px solid #fff`;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      border: ${border};
      box-shadow: 0 0 8px ${color}80;
    "></div>`,
  });
}

function getConePoints(
  latlng: L.LatLng,
  rotation: number,
  angle: number,
  distance: number
): L.LatLng[] {
  const startAngle = rotation - angle / 2;
  const endAngle = rotation + angle / 2;
  const steps = Math.max(8, Math.ceil(angle / 5));
  const points: L.LatLng[] = [latlng];

  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (a * Math.PI) / 180;
    const dLat = (distance * Math.cos(rad)) / 111320;
    const dLng =
      (distance * Math.sin(rad)) /
      (111320 * Math.cos((latlng.lat * Math.PI) / 180));
    points.push(L.latLng(latlng.lat + dLat, latlng.lng + dLng));
  }

  points.push(latlng);
  return points;
}

export function CameraMarker({
  camera,
  isActive,
  isEditing,
  coneInteractive = true,
  onClick,
  onPositionChange,
}: CameraMarkerProps) {
  const map = useMap();
  const coneRef = useRef<L.Polygon | null>(null);

  const position: L.LatLngExpression | null =
    camera.lat != null && camera.lng != null
      ? [camera.lat, camera.lng]
      : null;

  useEffect(() => {
    if (!position) return;

    const latlng = L.latLng(position[0], position[1]);
    const points = getConePoints(latlng, camera.rotation, camera.angle, camera.distance);

    if (coneRef.current) {
      coneRef.current.setLatLngs(points);
      coneRef.current.setStyle({
        fillColor: camera.color,
        color: camera.color,
        fillOpacity: isActive ? 0.25 : 0.15,
        weight: isActive ? 2 : 1,
      });
    } else {
      coneRef.current = L.polygon(points, {
        fillColor: camera.color,
        color: camera.color,
        fillOpacity: isActive ? 0.25 : 0.15,
        weight: isActive ? 2 : 1,
        dashArray: isActive ? undefined : "4 3",
        interactive: coneInteractive,
        bubblingMouseEvents: false,
      }).addTo(map);
      if (coneInteractive) {
        coneRef.current.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onClick(camera.id);
        });
        coneRef.current.on("dblclick", (e) => {
          L.DomEvent.stopPropagation(e);
          map.setView(latlng, map.getZoom(), { animate: true });
        });
      }
    }

    return () => {
      if (coneRef.current) {
        coneRef.current.remove();
        coneRef.current = null;
      }
    };
  }, [map, position, camera.rotation, camera.angle, camera.distance, camera.color, isActive, camera.id, coneInteractive, onClick]);

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={createCameraIcon(camera.color, isActive)}
      draggable={isEditing}
      eventHandlers={{
        click: () => onClick(camera.id),
        dblclick: (e) => {
          L.DomEvent.stopPropagation(e);
          map.setView(e.target.getLatLng(), map.getZoom(), { animate: true });
        },
        dragend: (e) => {
          if (onPositionChange) {
            const ll = e.target.getLatLng();
            onPositionChange(camera.id, ll.lat, ll.lng);
          }
        },
      }}
    />
  );
}

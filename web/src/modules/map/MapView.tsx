import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useMapStore } from "./mapStore";
import { useEffect } from "react";

const TILE_URLS = {
  streets: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const TILE_ATTR = {
  streets: "&copy; OpenStreetMap contributors",
  satellite: "&copy; Esri World Imagery",
};

function MapController() {
  const map = useMap();
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const fitBoundsRequest = useMapStore((s) => s.fitBoundsRequest);

  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);

  useEffect(() => {
    if (!fitBoundsRequest || fitBoundsRequest.coords.length === 0) return;
    if (fitBoundsRequest.coords.length === 1) {
      map.setView(fitBoundsRequest.coords[0], 18, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(fitBoundsRequest.coords);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19, animate: true });
  }, [map, fitBoundsRequest]);

  useEffect(() => {
    const container = map.getContainer();
    const recenter = () => {
      const c = map.getCenter();
      map.invalidateSize();
      map.setView(c, map.getZoom(), { animate: false });
    };

    const observer = new ResizeObserver(recenter);
    observer.observe(container);
    window.addEventListener("resize", recenter);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recenter);
    };
  }, [map]);

  return null;
}

function TileLayerSwitch() {
  const tileLayer = useMapStore((s) => s.tileLayer);
  // OSM has tiles only up to zoom 19. Esri up to 20.
  // maxNativeZoom limits actual tile requests; maxZoom allows the map itself
  // to zoom beyond that by scaling the last available tiles.
  const maxNativeZoom = tileLayer === "streets" ? 19 : 20;
  return (
    <TileLayer
      key={tileLayer}
      url={TILE_URLS[tileLayer]}
      attribution={TILE_ATTR[tileLayer]}
      maxNativeZoom={maxNativeZoom}
      maxZoom={22}
    />
  );
}

export function MapView({ children }: { children?: React.ReactNode }) {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const tileLayer = useMapStore((s) => s.tileLayer);
  const toggleTileLayer = useMapStore((s) => s.toggleTileLayer);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        zoomControl={false}
        doubleClickZoom={false}
      >
        <MapController />
        <TileLayerSwitch />
        {children}
      </MapContainer>

      <button
        onClick={toggleTileLayer}
        className="absolute bottom-3 right-3 z-[1000] bg-gray-800 text-white text-sm px-3 py-1.5 rounded shadow hover:bg-gray-700"
      >
        {tileLayer === "streets" ? "Спутник" : "Улицы"}
      </button>
    </div>
  );
}

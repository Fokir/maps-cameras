import { MapContainer, TileLayer, useMap } from "react-leaflet";
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

  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
      map.setView(map.getCenter(), map.getZoom());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  return null;
}

function TileLayerSwitch() {
  const tileLayer = useMapStore((s) => s.tileLayer);
  return (
    <TileLayer
      key={tileLayer}
      url={TILE_URLS[tileLayer]}
      attribution={TILE_ATTR[tileLayer]}
      maxZoom={20}
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

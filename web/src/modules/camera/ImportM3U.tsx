import { useRef } from "react";
import { cameraApi } from "./cameraApi";
import { useCameraStore } from "./cameraStore";

export function ImportM3U() {
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchCameras = useCameraStore((s) => s.fetchCameras);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await cameraApi.importM3U(file);
      alert(
        `Импортировано: ${result.imported}, пропущено: ${result.skipped}` +
          (result.errors?.length ? `\nОшибки: ${result.errors.join(", ")}` : "")
      );
      fetchCameras();
    } catch (err) {
      alert(`Ошибка импорта: ${err}`);
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".m3u,.m3u8"
        className="hidden"
        onChange={handleImport}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full bg-slate-600/70 hover:bg-slate-500/70 text-slate-100 text-sm py-2 rounded-lg shadow-md shadow-black/20 ring-1 ring-white/10 hover:ring-white/20 active:scale-[0.98] transition-all duration-150"
      >
        📥 Импорт M3U
      </button>
    </>
  );
}

// Audios de los ejercicios: se suben desde el navegador del staff directo a
// Vercel Blob (/api/admin/audios solo firma la subida) o se pega el enlace de
// un archivo ya publicado. Puro: lo usan el editor y la ruta.

export const TIPOS_AUDIO = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];
export const MAX_AUDIO_MB = 50;
export const CARPETA_AUDIOS = "ejercicios/audios/";

// "Audio 1 (final).mp3" → "ejercicios/audios/audio-1-final.mp3"
export function rutaAudio(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  const base = (punto > 0 ? nombre.slice(0, punto) : nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "mp3";
  return `${CARPETA_AUDIOS}${base || "audio"}.${ext || "mp3"}`;
}

// Título sugerido a partir del nombre del archivo: "audio_03.mp3" → "Audio 03".
export function tituloDeArchivo(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  const base = (punto > 0 ? nombre.slice(0, punto) : nombre).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Audio";
}

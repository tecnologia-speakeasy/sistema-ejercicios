"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { Icono } from "@/app/components/ui/Icono";
import { MAX_AUDIO_MB, rutaAudio } from "@/lib/audios";

// Sube un audio a Vercel Blob (/api/admin/audios firma la subida) y devuelve su URL.
export async function subirAudio(archivo: File): Promise<string> {
  if (archivo.size > MAX_AUDIO_MB * 1024 * 1024) throw new Error(`El audio pesa más de ${MAX_AUDIO_MB} MB.`);
  const blob = await upload(rutaAudio(archivo.name), archivo, {
    access: "public",
    handleUploadUrl: "/api/admin/audios",
    contentType: archivo.type || undefined,
  });
  return blob.url;
}

export const ERROR_SUBIDA = `No pudimos subir el audio. Revisa que sea un archivo de audio (mp3, m4a, wav…) de máximo ${MAX_AUDIO_MB} MB e inténtalo de nuevo.`;

// Campo del audio: subir el archivo (si BLOB_READ_WRITE_TOKEN está configurada)
// o pegar el enlace de un audio ya publicado. Con audio, se puede escuchar aquí.
export function CampoAudio({
  valor,
  onCambio,
  subidaAudios,
  error,
  opcional = false,
}: {
  valor: string;
  onCambio: (url: string) => void;
  subidaAudios: boolean;
  error?: string | null;
  opcional?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const valido = /^https?:\/\/\S+$/i.test(valor.trim());

  async function alElegir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setErrorSubida(null);
    try {
      onCambio(await subirAudio(archivo));
    } catch (e) {
      setErrorSubida(e instanceof Error && e.message.includes("MB") ? e.message : ERROR_SUBIDA);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Campo
      etiqueta={opcional ? "Audio (opcional)" : "Audio"}
      htmlFor="ej-audio"
      error={errorSubida ?? error}
      ayuda={
        subidaAudios
          ? `Sube el archivo (mp3, m4a, wav… hasta ${MAX_AUDIO_MB} MB) o pega el enlace de un audio ya publicado.`
          : "Pega el enlace público del audio (https://…). Para subir archivos, configura BLOB_READ_WRITE_TOKEN."
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Entrada
          id="ej-audio"
          value={valor}
          placeholder="https://…"
          onChange={(e) => onCambio(e.target.value)}
          invalida={Boolean(error || errorSubida)}
        />
        {subidaAudios && (
          <label
            className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-rosa bg-white px-4 py-2.5 text-sm font-semibold text-rosa hover:bg-rosa/5 ${
              subiendo ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <Icono nombre="subir" className="size-[18px]" />
            {subiendo ? "Subiendo…" : "Subir archivo"}
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              disabled={subiendo}
              onChange={(e) => {
                void alElegir(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {valido && (
        <div className="mt-2 flex items-center gap-2">
          <audio controls preload="none" src={valor.trim()} className="h-10 w-full" />
          <Boton variante="texto" tamano="sm" onClick={() => onCambio("")}>
            Quitar
          </Boton>
        </div>
      )}
    </Campo>
  );
}

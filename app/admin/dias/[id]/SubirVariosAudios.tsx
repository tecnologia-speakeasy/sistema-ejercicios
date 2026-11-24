"use client";

import { useState, useTransition } from "react";
import { crearVariosAudiosAction } from "@/app/admin/acciones/ejercicios";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { AreaTexto, Entrada } from "@/app/components/ui/Campo";
import { Icono } from "@/app/components/ui/Icono";
import { tituloDeArchivo } from "@/lib/audios";
import { ERROR_SUBIDA, subirAudio } from "./CampoAudio";

// Varios audios de transcripción de una vez (pensado para los 10 audios cortos
// diarios de la G2): se eligen los archivos (quedan ordenados por nombre), se
// suben, y se escribe la transcripción de cada uno antes de guardar.

type Fila = { clave: string; titulo: string; audio_url: string; transcripcion: string; subiendo: boolean; error: string | null };

export default function SubirVariosAudios({ diaId, onListo }: { diaId: number; onListo: () => void }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const subiendo = filas.some((f) => f.subiendo);

  const actualizar = (clave: string, parcial: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)));

  async function elegir(lista: FileList | null) {
    if (!lista?.length) return;
    setError(null);
    const archivos = [...lista].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    const nuevas = archivos.map((a, i) => ({
      clave: `${Date.now()}-${i}-${a.name}`,
      titulo: tituloDeArchivo(a.name),
      audio_url: "",
      transcripcion: "",
      subiendo: true,
      error: null,
    }));
    setFilas((fs) => [...fs, ...nuevas]);
    // De a uno: así no se satura la conexión del celular o del club.
    for (let i = 0; i < archivos.length; i++) {
      try {
        actualizar(nuevas[i].clave, { audio_url: await subirAudio(archivos[i]), subiendo: false });
      } catch {
        actualizar(nuevas[i].clave, { subiendo: false, error: ERROR_SUBIDA });
      }
    }
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await crearVariosAudiosAction(
        diaId,
        filas.map((f) => ({ titulo: f.titulo, audio_url: f.audio_url, transcripcion: f.transcripcion })),
      );
      if (r.ok) onListo();
      else setError(r.error);
    });
  }

  const listas = filas.filter((f) => f.audio_url && f.transcripcion.trim()).length;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-borde bg-campo px-4 py-6 text-center hover:border-rosa">
        <Icono nombre="subir" className="size-7 text-rosa" />
        <span className="text-[15px] font-bold text-tinta">Elige los audios</span>
        <span className="text-[13px] text-gris-oscuro">
          Puedes elegir varios a la vez. Quedan en el orden de sus nombres (audio-01, audio-02…).
        </span>
        <input type="file" accept="audio/*" multiple className="sr-only" onChange={(e) => void elegir(e.target.files).then(() => (e.target.value = ""))} />
      </label>

      {filas.length > 0 && (
        <ol className="flex flex-col gap-3">
          {filas.map((f, i) => (
            <li key={f.clave} className="rounded-xl border-[1.5px] border-borde bg-white p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-lavanda text-xs font-bold text-violeta">
                  {i + 1}
                </span>
                <Entrada
                  aria-label={`Título del audio ${i + 1}`}
                  value={f.titulo}
                  onChange={(e) => actualizar(f.clave, { titulo: e.target.value })}
                  className="!py-2"
                />
                <Boton
                  variante="texto"
                  tamano="sm"
                  aria-label={`Quitar el audio ${i + 1}`}
                  onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                >
                  Quitar
                </Boton>
              </div>
              {f.subiendo ? (
                <p className="mb-2 text-[13px] text-gris-oscuro">Subiendo…</p>
              ) : f.error ? (
                <p className="mb-2 text-[13px] text-error-texto">{f.error}</p>
              ) : (
                <audio controls preload="none" src={f.audio_url} className="mb-2 h-10 w-full" />
              )}
              <AreaTexto
                aria-label={`Lo que dice el audio ${i + 1}`}
                rows={2}
                placeholder="Lo que dice el audio…"
                value={f.transcripcion}
                onChange={(e) => actualizar(f.clave, { transcripcion: e.target.value })}
              />
            </li>
          ))}
        </ol>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      {filas.length > 0 && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gris-oscuro">
            {listas} de {filas.length} listos (con audio y transcripción).
          </p>
          <Boton onClick={guardar} disabled={pendiente || subiendo || listas !== filas.length}>
            {pendiente ? "Guardando…" : `Agregar ${filas.length} ${filas.length === 1 ? "audio" : "audios"}`}
          </Boton>
        </div>
      )}
    </div>
  );
}

"use client";

import { Fragment } from "react";
import type { EjercicioPublico } from "@/lib/datos/entregas";
import { contarEspacios, partirEnunciado } from "@/lib/ejercicios/completar";
import { ETIQUETA_TIPO, INSTRUCCION_POR_TIPO } from "@/lib/tipos";
import { ReproductorAudio } from "./ReproductorAudio";

// Un ejercicio tal como lo ve el estudiante (mismo lenguaje visual que el
// examen de sistema-evaluaciones). Solo recibe EjercicioPublico: por tipos no
// puede llegarle la transcripción, las respuestas ni la rúbrica.

export type RespuestaEjercicio = string | string[] | null;

export function tituloEjercicio(e: Pick<EjercicioPublico, "titulo" | "tipo">, numero: number): string {
  return e.titulo?.trim() || (e.tipo === "abierta" ? "Pregunta abierta" : `Audio ${numero}`);
}

export function respondido(e: EjercicioPublico, r: RespuestaEjercicio | undefined): boolean {
  if (e.tipo === "completar") {
    const n = e.espacios ?? contarEspacios(e.enunciado ?? "");
    return Array.isArray(r) && r.length >= n && r.slice(0, n).every((x) => x.trim() !== "");
  }
  return typeof r === "string" && r.trim() !== "";
}

export function EjercicioEstudiante({
  ejercicio: e,
  numero,
  respuesta,
  onCambio,
}: {
  ejercicio: EjercicioPublico;
  numero: number;
  respuesta: RespuestaEjercicio;
  onCambio: (r: RespuestaEjercicio) => void;
}) {
  const titulo = tituloEjercicio(e, numero);
  const instruccion = e.instruccion?.trim() || INSTRUCCION_POR_TIPO[e.tipo];

  return (
    <div>
      {/* Escritorio */}
      <div className="hidden md:block">
        <p className="mb-1 text-sm font-semibold text-gris">{ETIQUETA_TIPO[e.tipo]}</p>
        <h1 className="mb-2.5 text-[26px] font-extrabold text-titulo">{titulo}</h1>
        <p className="mb-[22px] text-base leading-normal text-tinta">{instruccion}</p>
      </div>
      {/* Celular: tarjeta morada */}
      <div className="degradado-tarjeta-movil mb-[22px] rounded-[20px] px-[22px] pt-[22px] pb-6 text-center text-white md:hidden">
        <p className="mb-1 text-xs font-semibold tracking-wide text-white/70 uppercase">{ETIQUETA_TIPO[e.tipo]}</p>
        <h2 className="mb-2 text-[22px] font-extrabold text-white">{titulo}</h2>
        <p className="text-[15px] leading-normal text-white/90">{instruccion}</p>
      </div>

      {/* key = id: al pasar a otro ejercicio el audio arranca de cero. */}
      {e.audio_url && (
        <div className="mb-5">
          <ReproductorAudio key={e.id} src={e.audio_url} etiqueta={titulo} />
        </div>
      )}

      {e.tipo === "completar" ? (
        <Completar ejercicio={e} valores={Array.isArray(respuesta) ? respuesta : []} onCambio={onCambio} />
      ) : (
        <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-[18px] py-5 md:px-[22px]">
          {e.tipo === "abierta" && (
            <p className="mb-3.5 text-base font-semibold whitespace-pre-line text-tinta">{e.enunciado}</p>
          )}
          <label htmlFor={`ej-${e.id}`} className="sr-only">
            {e.tipo === "transcripcion" ? "Tu transcripción" : "Tu respuesta"}
          </label>
          <textarea
            id={`ej-${e.id}`}
            value={typeof respuesta === "string" ? respuesta : ""}
            onChange={(ev) => onCambio(ev.target.value)}
            placeholder={e.tipo === "transcripcion" ? "Write exactly what you hear…" : "Write your answer here…"}
            rows={e.tipo === "transcripcion" ? 5 : 6}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="sentences"
            className="w-full resize-y rounded-[10px] border-[1.5px] border-borde bg-campo px-3.5 py-3 font-[inherit] text-[15px] leading-relaxed text-tinta outline-none"
          />
        </div>
      )}
    </div>
  );
}

// El texto con los espacios como campos en línea (xs.fillBox de evaluaciones).
function Completar({
  ejercicio,
  valores,
  onCambio,
}: {
  ejercicio: EjercicioPublico;
  valores: string[];
  onCambio: (r: RespuestaEjercicio) => void;
}) {
  const texto = ejercicio.enunciado ?? "";
  const espacios = ejercicio.espacios ?? contarEspacios(texto);
  const partes = partirEnunciado(texto);

  return (
    <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-5 py-6 text-[17px] leading-[2.1] whitespace-pre-line text-tinta md:px-6">
      {partes.map((seg, i) => (
        <Fragment key={i}>
          {seg}
          {i < partes.length - 1 && (
            <input
              type="text"
              aria-label={`Espacio ${i + 1}`}
              value={valores[i] ?? ""}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(ev) => {
                const nuevos = Array.from({ length: espacios }, (_, j) => valores[j] ?? "");
                nuevos[i] = ev.target.value;
                onCambio(nuevos);
              }}
              className="mx-1 w-[120px] border-0 border-b-2 border-tinta bg-transparent px-1.5 py-0 text-center font-[inherit] text-[17px] font-semibold text-tinta outline-none focus:border-rosa"
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

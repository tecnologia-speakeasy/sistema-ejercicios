import { Fragment, type ReactNode } from "react";
import type { RespuestaRevision } from "@/lib/datos/revision";
import type { DetalleCompletar } from "@/lib/ejercicios/calificar";
import { partirEnunciado } from "@/lib/ejercicios/completar";
import type { DetalleTranscripcion, Operacion } from "@/lib/ejercicios/transcripcion";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { ReproductorAudio } from "./ReproductorAudio";

// Un ejercicio ya entregado: lo que escribió, lo que decía el audio, la
// comparación palabra por palabra (transcripción), los espacios marcados
// (completar) o la nota y el comentario de la IA (abierta). Lo usan la
// revisión del estudiante y la vista del staff.

export function tonoNota(nota: number | null): string {
  if (nota === null) return "bg-lavanda text-violeta";
  if (nota >= 0.8) return "bg-[rgba(34,197,94,0.14)] text-exito";
  if (nota >= 0.5) return "bg-[rgba(250,204,21,0.2)] text-[#a16207]";
  return "bg-[rgba(239,68,68,0.10)] text-error";
}

export function RevisionEjercicio({ r, numero, mostrarPeso = false }: { r: RespuestaRevision; numero: number; mostrarPeso?: boolean }) {
  const titulo = r.titulo?.trim() || (r.tipo === "abierta" ? "Pregunta abierta" : `Audio ${numero}`);
  const notaTexto =
    r.nota === null ? "Calificando…" : r.tipo === "abierta" ? `${Math.round(r.nota * 10)}/10` : `${Math.round(r.nota * 100)}%`;

  return (
    <article className="rounded-[14px] border-[1.5px] border-borde bg-white px-[18px] py-5 md:px-[22px]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gris">
            {numero}. {ETIQUETA_TIPO[r.tipo]}
            {mostrarPeso && ` · peso ${r.peso}`}
          </p>
          <h2 className="text-[18px] font-extrabold text-titulo">{titulo}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${tonoNota(r.nota)}`}>{notaTexto}</span>
      </header>

      {r.audio_url && (
        <div className="mb-4">
          <ReproductorAudio src={r.audio_url} etiqueta={titulo} />
        </div>
      )}

      {r.tipo === "transcripcion" && <Transcripcion r={r} />}
      {r.tipo === "completar" && <Completar r={r} />}
      {r.tipo === "abierta" && <Abierta r={r} />}
    </article>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <p className="mb-1.5 text-xs font-bold tracking-wide text-gris uppercase">{titulo}</p>
      {children}
    </div>
  );
}

const textoPlano = "rounded-[10px] bg-campo px-3.5 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-tinta";

function Transcripcion({ r }: { r: RespuestaRevision }) {
  const d = r.detalle as DetalleTranscripcion | null;
  return (
    <>
      <Bloque titulo="Tu transcripción">
        <p className={textoPlano}>{typeof r.respuesta === "string" ? r.respuesta : <em className="text-gris">(vacía)</em>}</p>
      </Bloque>
      <Bloque titulo="Lo que decía el audio">
        <p className={`${textoPlano} bg-lavanda`}>{r.transcripcion}</p>
      </Bloque>
      {d && d.aciertos === d.palabras && d.ops.length === d.palabras && d.palabras > 0 ? (
        <p className="mt-3 text-sm font-semibold text-exito">¡Perfecta! Escribiste las {d.palabras} palabras del audio.</p>
      ) : d && d.ops.length > 0 && (
        <Bloque titulo={`Palabra por palabra · ${d.aciertos} de ${d.palabras} correctas`}>
          <p className="rounded-[10px] border border-borde-suave px-3.5 py-3 text-[15px] leading-[2]">
            {d.ops.map((o, i) => (
              <Fragment key={i}>
                <Palabra o={o} />{" "}
              </Fragment>
            ))}
          </p>
          <Leyenda />
        </Bloque>
      )}
    </>
  );
}

function Palabra({ o }: { o: Operacion }) {
  switch (o.t) {
    case "ok":
      return <span className="text-tinta">{o.p}</span>;
    case "cambio":
      return (
        <span className="whitespace-nowrap">
          <s className="rounded bg-[rgba(239,68,68,0.10)] px-1 text-error">{o.dada}</s>
          <span className="ml-0.5 rounded bg-[rgba(34,197,94,0.14)] px-1 font-semibold text-exito">{o.p}</span>
        </span>
      );
    case "falta":
      return (
        <span title="No la escribiste" className="rounded border border-dashed border-exito-borde px-1 font-semibold text-exito">
          {o.p}
        </span>
      );
    case "sobra":
      return (
        <s title="No estaba en el audio" className="rounded bg-[rgba(239,68,68,0.10)] px-1 text-error">
          {o.dada}
        </s>
      );
  }
}

function Leyenda() {
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gris-oscuro">
      <span>
        <s className="rounded bg-[rgba(239,68,68,0.10)] px-1 text-error">así</s> escribiste de más o distinto
      </span>
      <span>
        <span className="rounded bg-[rgba(34,197,94,0.14)] px-1 font-semibold text-exito">así</span> era
      </span>
      <span>
        <span className="rounded border border-dashed border-exito-borde px-1 font-semibold text-exito">así</span> te faltó
      </span>
      <span className="text-gris">No cuentan mayúsculas, puntuación ni tildes.</span>
    </p>
  );
}

function Completar({ r }: { r: RespuestaRevision }) {
  const d = r.detalle as DetalleCompletar | null;
  const partes = partirEnunciado(r.enunciado ?? "");
  return (
    <Bloque titulo="Tu texto">
      <p className="rounded-[10px] border border-borde-suave px-3.5 py-3 text-[16px] leading-[2.1] whitespace-pre-line text-tinta">
        {partes.map((seg, i) => {
          const espacio = d?.espacios[i];
          const correcta = r.correctas?.[i]?.[0] ?? "";
          return (
            <Fragment key={i}>
              {seg}
              {i < partes.length - 1 &&
                (espacio?.correcta ? (
                  <span className="rounded bg-[rgba(34,197,94,0.14)] px-1.5 font-semibold text-exito">{espacio.dada}</span>
                ) : (
                  <span className="whitespace-nowrap">
                    {espacio?.dada ? (
                      <s className="rounded bg-[rgba(239,68,68,0.10)] px-1.5 text-error">{espacio.dada}</s>
                    ) : (
                      <span className="rounded bg-[rgba(239,68,68,0.10)] px-1.5 text-error">(vacío)</span>
                    )}
                    <span className="ml-0.5 rounded bg-[rgba(34,197,94,0.14)] px-1.5 font-semibold text-exito">{correcta}</span>
                  </span>
                ))}
            </Fragment>
          );
        })}
      </p>
      {d && (
        <p className="mt-2 text-xs text-gris-oscuro">
          {d.espacios.filter((e) => e.correcta).length} de {d.espacios.length} espacios correctos.
        </p>
      )}
    </Bloque>
  );
}

function Abierta({ r }: { r: RespuestaRevision }) {
  return (
    <>
      <Bloque titulo="Pregunta">
        <p className="text-[15px] font-semibold whitespace-pre-line text-tinta">{r.enunciado}</p>
      </Bloque>
      <Bloque titulo="Tu respuesta">
        <p className={textoPlano}>{typeof r.respuesta === "string" ? r.respuesta : <em className="text-gris">(vacía)</em>}</p>
      </Bloque>
      <Bloque titulo="Comentario de la IA">
        <p className="rounded-[10px] bg-lavanda px-3.5 py-3 text-[15px] leading-relaxed text-tinta">
          {r.nota === null
            ? "La IA está calificando tu respuesta…"
            : r.feedback || (r.respuesta === null ? "No respondiste esta pregunta." : "Sin comentario.")}
        </p>
      </Bloque>
    </>
  );
}

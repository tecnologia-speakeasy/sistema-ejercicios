import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnilloProgreso } from "@/app/components/examen/AnilloProgreso";
import { Confeti } from "@/app/components/examen/Confeti";
import { EsperarResultado } from "@/app/components/examen/EsperarResultado";
import { VerFeedback } from "@/app/components/examen/VerFeedback";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { celebracionPorPuntaje } from "@/lib/celebracion";
import { entregaDelEstudiante, type DetalleEntrega } from "@/lib/datos/revision";
import { formatearFecha } from "@/lib/fechas";
import { FECHA_URL } from "@/lib/tipos";

export const metadata: Metadata = { title: "Resultado del día" };

// Resultado de un día (la celebración de evaluaciones): puntaje, cómo le fue en
// cada ejercicio, "Revisa tu feedback" y "Ver mis respuestas". Solo el dueño.
export default function PaginaResultado({ params }: PageProps<"/dia/[fecha]/resultado">) {
  return (
    <Suspense fallback={<div className="fondo-intro min-h-screen flex-1" />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = await params;
  if (!FECHA_URL.test(fecha)) notFound();
  const estudiante = await estudianteParaPagina(`/dia/${fecha}/resultado`);
  const d = await entregaDelEstudiante(fecha, estudiante.id, estudiante.generacion_id);
  if (!d) notFound();
  return <Celebracion d={d} />;
}

function Celebracion({ d }: { d: DetalleEntrega }) {
  // Sin puntaje: la IA aún califica la pregunta abierta. En proceso: falta el
  // feedback (la página se actualiza sola cuando queda listo).
  const sinPuntaje = d.puntaje_total === null;
  const enProceso = d.estado !== "listo";
  const c = celebracionPorPuntaje(d.puntaje_total);
  const hrefRespuestas = `/dia/${d.dia.fecha}/respuestas`;
  const secundario =
    "flex-1 rounded-xl border-[1.5px] border-white/45 bg-white/12 px-3 py-[13px] text-[15px] font-semibold whitespace-nowrap text-white hover:bg-white/18";

  return (
    <div className="fondo-intro relative flex min-h-screen flex-1 flex-col items-center overflow-x-hidden p-6 text-center">
      {!sinPuntaje && <Confeti />}
      {enProceso && d.estado !== "error" && <EsperarResultado entregaId={d.id} />}
      <Link href="/" className="absolute top-[22px] right-[30px] z-[2] text-[15px] text-white/85 hover:text-white">
        Cerrar ✕
      </Link>

      <div className="relative z-[1] my-auto flex flex-col items-center pt-8">
        <p className="mb-4 text-sm font-semibold text-white/60">
          Día {d.dia.numero} · {formatearFecha(d.dia.fecha)}
          {d.dia.titulo ? ` · ${d.dia.titulo}` : ""}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- como en evaluaciones */}
        <img
          src={sinPuntaje ? "/spiky-calificando.png" : c.img}
          alt=""
          className="mb-4 h-auto w-[150px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.3)]"
        />
        <h1 className="mb-2.5 text-[clamp(28px,5vw,38px)] font-extrabold text-white">
          {sinPuntaje ? "¡Recibimos tu práctica!" : c.titulo}
        </h1>
        <p className="mb-7 max-w-[430px] text-[15px] leading-[1.45] text-white/82">
          {sinPuntaje ? "La IA está calificando tu pregunta abierta. En un momento verás tu puntaje final." : c.sub}
        </p>

        <div className="mb-7 flex flex-wrap items-center justify-center gap-[30px] rounded-[20px] border border-white/14 bg-white/10 px-[26px] py-[26px]">
          <AnilloProgreso progreso={d.puntaje_total ?? 0} tamano={140} grosor={9}>
            <span className="text-[40px] leading-none font-extrabold text-white">{d.puntaje_total ?? "…"}</span>
            <span className="mt-0.5 text-[13px] text-white/70">{sinPuntaje ? "Pendiente" : "Puntaje"}</span>
          </AnilloProgreso>
          <ul className={`grid gap-2 ${d.respuestas.length > 5 ? "sm:grid-cols-2" : ""}`}>
            {d.respuestas.map((r, i) => (
              <li
                key={r.ejercicio_id}
                className="flex min-w-[200px] items-center justify-between gap-5 rounded-[10px] bg-white px-4 py-[9px]"
              >
                <span className="truncate text-sm text-tinta">
                  {r.titulo?.trim() || (r.tipo === "abierta" ? "Pregunta abierta" : `Audio ${i + 1}`)}
                </span>
                <span className="text-[16px] font-semibold text-tinta">
                  {r.nota === null ? (
                    "…"
                  ) : r.tipo === "abierta" ? (
                    <>
                      {Math.round(r.nota * 10)}
                      <span className="ml-px font-extrabold text-rosa-hover">/10</span>
                    </>
                  ) : (
                    <>
                      {Math.round(r.nota * 100)}
                      <span className="ml-px font-extrabold text-rosa-hover">%</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {enProceso && (
          <p role="status" className="mb-4 max-w-[420px] text-[14px] leading-snug text-white/80">
            {d.estado === "error"
              ? "Tu retroalimentación se está demorando. Vuelve en un rato: aparecerá aquí."
              : "Tu retroalimentación está en camino: aparecerá aquí en unos segundos."}
          </p>
        )}

        {d.feedback ? (
          <VerFeedback feedback={d.feedback} hrefRespuestas={hrefRespuestas} repetir={null} />
        ) : (
          <Link
            href={hrefRespuestas}
            className="degradado-boton w-[min(420px,82vw)] rounded-xl py-3.5 text-[15px] font-semibold text-white"
          >
            Ver mis respuestas
          </Link>
        )}
        <div className="mt-3 flex w-[min(420px,82vw)] flex-col gap-3 sm:flex-row">
          {d.feedback && (
            <Link href={hrefRespuestas} className={secundario}>
              Ver mis respuestas
            </Link>
          )}
          <Link href="/" className={secundario}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

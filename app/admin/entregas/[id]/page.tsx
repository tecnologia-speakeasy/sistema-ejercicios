import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { entregaParaStaff } from "@/lib/datos/revision";
import { formatearFecha, formatearFechaHora } from "@/lib/fechas";
import { idUrlSchema } from "@/lib/validacion";
import { RevisionEjercicio } from "@/app/components/ejercicios/RevisionEjercicio";
import { Aviso } from "@/app/components/ui/Aviso";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import BotonReintentar from "@/app/admin/progreso/BotonReintentar";
import EliminarEntrega from "./EliminarEntrega";

export const metadata: Metadata = { title: "Entrega" };

const ESTADO = {
  en_progreso: { texto: "En curso", tono: "lavanda" },
  pendiente: { texto: "Esperando a la IA", tono: "lavanda" },
  calificando: { texto: "IA calificando", tono: "violeta" },
  listo: { texto: "Lista", tono: "verde" },
  error: { texto: "La IA falló", tono: "rojo" },
} as const;

// Lo que entregó un estudiante en un día: puntaje, feedback de la IA y cada
// ejercicio con su comparación. Reintentar IA y eliminar la entrega.
export default function PaginaEntrega({ params }: PageProps<"/admin/entregas/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const staff = await staffParaPagina();
  const id = idUrlSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const d = await entregaParaStaff(id.data);
  if (!d) notFound();
  const estado = ESTADO[d.estado];
  const sinFeedback = d.estado !== "listo" && d.estado !== "en_progreso" && !d.procesando;

  return (
    <>
      <TituloPagina
        antes={
          <Link href={`/admin/progreso?generacion=${d.generacion.id}`} className="font-semibold text-gris-oscuro hover:text-violeta">
            ← Progreso de {d.generacion.nombre}
          </Link>
        }
        titulo={d.nombre}
        subtitulo={
          <>
            {d.email} · Día {d.dia.numero} ({formatearFecha(d.dia.fecha)})
            {d.entregado && ` · entregado ${formatearFechaHora(d.entregado)}`}
          </>
        }
        acciones={
          <>
            {sinFeedback && <BotonReintentar entregaId={d.id} />}
            {staff.rol === "admin" && <EliminarEntrega entregaId={d.id} quien={d.nombre} dia={d.dia.numero} />}
          </>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-[220px_1fr]">
        <Tarjeta className="flex flex-col items-start gap-2">
          <Insignia tono={estado.tono}>{estado.texto}</Insignia>
          <p className="text-[13px] text-gris">Puntaje del día</p>
          <p className="text-[34px] leading-none font-extrabold text-tinta">
            {d.puntaje_total ?? "…"}
            {d.puntaje_total !== null && <span className="text-base font-bold text-rosa-hover">/100</span>}
          </p>
        </Tarjeta>
        <Tarjeta>
          <p className="mb-1.5 text-xs font-bold tracking-wide text-gris uppercase">Retroalimentación de la IA</p>
          {d.feedback ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-tinta">{d.feedback}</p>
          ) : (
            <p className="text-[15px] text-gris-oscuro">{d.estado === "en_progreso" ? "Aún no la entrega." : "Todavía no hay feedback."}</p>
          )}
          {d.ia_error && d.estado !== "listo" && (
            <Aviso tono="error" className="mt-3">
              Último error de la IA: {d.ia_error}
            </Aviso>
          )}
        </Tarjeta>
      </div>

      {d.respuestas.length === 0 ? (
        <Tarjeta className="text-center text-gris-oscuro">El estudiante aún no ha entregado este día.</Tarjeta>
      ) : (
        <ol className="flex flex-col gap-4">
          {d.respuestas.map((r, i) => (
            <li key={r.ejercicio_id}>
              <RevisionEjercicio r={r} numero={i + 1} mostrarPeso />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

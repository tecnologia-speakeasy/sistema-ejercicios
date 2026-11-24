import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RevisionEjercicio } from "@/app/components/ejercicios/RevisionEjercicio";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Encabezado, TituloPagina } from "@/app/components/ui/Encabezado";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { entregaDelEstudiante } from "@/lib/datos/revision";
import { formatearFecha } from "@/lib/fechas";
import { FECHA_URL } from "@/lib/tipos";

export const metadata: Metadata = { title: "Mis respuestas" };

// Revisión de un día entregado: cada ejercicio con lo que escribió, lo que
// decía el audio y la comparación palabra por palabra. Solo el dueño.
export default function PaginaRespuestas({ params }: PageProps<"/dia/[fecha]/respuestas">) {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <Contenido params={params} />
      </Suspense>
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = await params;
  if (!FECHA_URL.test(fecha)) notFound();
  const estudiante = await estudianteParaPagina(`/dia/${fecha}/respuestas`);
  const d = await entregaDelEstudiante(fecha, estudiante.id, estudiante.generacion_id);
  if (!d) notFound();

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-[18px] pt-[18px] pb-12 md:px-7 md:pt-[34px]">
        <TituloPagina
          antes={`Día ${d.dia.numero} · ${formatearFecha(d.dia.fecha)}`}
          titulo="Tus respuestas"
          subtitulo={
            d.puntaje_total === null ? (
              "Tu puntaje aparecerá cuando la IA termine de calificar la pregunta abierta."
            ) : (
              <>
                Puntaje del día: <strong>{d.puntaje_total}/100</strong>
              </>
            )
          }
          acciones={
            <>
              <BotonEnlace href={`/dia/${d.dia.fecha}/resultado`} variante="secundario">
                Ver resultado
              </BotonEnlace>
              <BotonEnlace href="/">Volver al inicio</BotonEnlace>
            </>
          }
        />
        <ol className="flex flex-col gap-4">
          {d.respuestas.map((r, i) => (
            <li key={r.ejercicio_id}>
              <RevisionEjercicio r={r} numero={i + 1} />
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}

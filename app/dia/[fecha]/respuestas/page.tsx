import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RevisionEjercicio } from "@/app/components/ejercicios/RevisionEjercicio";
import { Aviso } from "@/app/components/ui/Aviso";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Encabezado, TituloPagina } from "@/app/components/ui/Encabezado";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { entregaDelEstudiante } from "@/lib/datos/revision";
import { formatearFecha } from "@/lib/fechas";
import { accionRepetir, leerIntento } from "@/lib/intentos";
import { FECHA_URL, MAX_INTENTOS } from "@/lib/tipos";

export const metadata: Metadata = { title: "Mis respuestas" };

// Revisión de un intento: cada ejercicio con lo que escribió y la comparación
// palabra por palabra. Lo que decía el audio y las respuestas correctas solo
// cuando ya usó sus intentos o cerró el plazo (antes ni siquiera salen de la BD
// hacia la página: ver entregaDelEstudiante). ?intento=N; sin él, el último.
export default function PaginaRespuestas({ params, searchParams }: PageProps<"/dia/[fecha]/respuestas">) {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Contenido({
  params,
  searchParams,
}: {
  params: Promise<{ fecha: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ fecha }, sp] = await Promise.all([params, searchParams]);
  if (!FECHA_URL.test(fecha)) notFound();
  const intento = leerIntento(sp.intento);
  const estudiante = await estudianteParaPagina(`/dia/${fecha}/respuestas${intento ? `?intento=${intento}` : ""}`);
  const d = await entregaDelEstudiante(fecha, intento, estudiante);
  if (!d) notFound();
  const repetir = accionRepetir(d.dia.fecha, d.estadoDia);
  const visibles = d.estadoDia.correctas_visibles;

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-[18px] pt-[18px] pb-12 md:px-7 md:pt-[34px]">
        <TituloPagina
          antes={`Día ${d.dia.numero} · ${formatearFecha(d.dia.fecha)} · Intento ${d.intento} de ${MAX_INTENTOS}`}
          titulo="Tus respuestas"
          subtitulo={
            d.puntaje_total === null ? (
              "Tu puntaje aparecerá cuando la IA termine de calificar la pregunta abierta."
            ) : (
              <>
                Puntaje de este intento: <strong>{d.puntaje_total}/100</strong>
              </>
            )
          }
          acciones={
            <>
              <BotonEnlace href={`/dia/${d.dia.fecha}/resultado?intento=${d.intento}`} variante="secundario">
                Ver resultado
              </BotonEnlace>
              {repetir && (
                <BotonEnlace href={repetir.href} variante="secundario">
                  {repetir.texto}
                </BotonEnlace>
              )}
              <BotonEnlace href="/">Volver al inicio</BotonEnlace>
            </>
          }
        />
        {!visibles && (
          <Aviso className="mb-4">
            Lo que decía cada audio y las respuestas correctas se mostrarán cuando termines tus intentos
            {estudiante.entrega_hasta ? ` o cuando cierre el plazo (${formatearFecha(estudiante.entrega_hasta)})` : ""}.
            Por ahora puedes ver qué palabras escribiste mal y dónde te faltó alguna.
          </Aviso>
        )}
        <ol className="flex flex-col gap-4">
          {d.respuestas.map((r, i) => (
            <li key={r.ejercicio_id}>
              <RevisionEjercicio r={r} numero={i + 1} correctasVisibles={visibles} />
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { diasParaCopiar, obtenerDia } from "@/lib/datos/dias";
import { listarEjercicios } from "@/lib/datos/ejercicios";
import { formatearFecha } from "@/lib/fechas";
import { idUrlSchema } from "@/lib/validacion";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Cargando } from "@/app/admin/components/Cargando";
import EditorDia from "./EditorDia";

export const metadata: Metadata = { title: "Ejercicios del día" };

export default function PaginaDia({ params }: PageProps<"/admin/dias/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await staffParaPagina();
  const id = idUrlSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [dia, ejercicios, copiables] = await Promise.all([obtenerDia(id.data), listarEjercicios(id.data), diasParaCopiar(id.data)]);
  if (!dia) notFound();

  return (
    <>
      <TituloPagina
        antes={
          <Link href={`/admin/generaciones/${dia.generacion_id}`} className="font-semibold text-gris-oscuro hover:text-violeta">
            ← {dia.generacion_nombre}
          </Link>
        }
        titulo={`Día ${dia.numero} · ${formatearFecha(dia.fecha)}`}
        subtitulo={
          dia.entregas > 0 ? (
            <>
              <strong>{dia.entregas}</strong> {dia.entregas === 1 ? "estudiante lo entregó" : "estudiantes lo entregaron"} ·{" "}
              <Link
                href={`/admin/progreso?generacion=${dia.generacion_id}`}
                className="font-semibold text-violeta underline-offset-2 hover:underline"
              >
                ver progreso
              </Link>
            </>
          ) : (
            "Aún nadie lo ha entregado."
          )
        }
        acciones={
          <>
            {dia.anterior && (
              <BotonEnlace href={`/admin/dias/${dia.anterior}`} variante="secundario" tamano="sm">
                ← Día anterior
              </BotonEnlace>
            )}
            {dia.siguiente && (
              <BotonEnlace href={`/admin/dias/${dia.siguiente}`} variante="secundario" tamano="sm">
                Día siguiente →
              </BotonEnlace>
            )}
          </>
        }
      />
      <EditorDia
        key={dia.id}
        diaId={dia.id}
        titulo={dia.titulo}
        publicado={dia.publicado}
        desbloqueado={dia.desbloqueado}
        programa={dia.programa}
        ejercicios={ejercicios}
        subidaAudios={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
        diasParaCopiar={copiables}
      />
    </>
  );
}

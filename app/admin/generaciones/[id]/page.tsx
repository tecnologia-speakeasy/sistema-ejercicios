import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarDias, type DiaResumen } from "@/lib/datos/dias";
import { obtenerGeneracion } from "@/lib/datos/generaciones";
import { query } from "@/lib/db";
import { formatearFecha } from "@/lib/fechas";
import { contarTipo, PROGRAMAS, TIPOS_EJERCICIO, type Programa } from "@/lib/tipos";
import { idUrlSchema } from "@/lib/validacion";
import { Aviso } from "@/app/components/ui/Aviso";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import EditarGeneracion from "./EditarGeneracion";
import EliminarGeneracion from "./EliminarGeneracion";
import InterruptorGeneracion from "./InterruptorGeneracion";
import PublicarListos from "./PublicarListos";

export const metadata: Metadata = { title: "Días de la generación" };

export default function PaginaGeneracion({ params }: PageProps<"/admin/generaciones/[id]">) {
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

  const esAdmin = staff.rol === "admin";
  const [generacion, dias, resumen] = await Promise.all([
    obtenerGeneracion(id.data),
    listarDias(id.data),
    query<{ estudiantes: number; en_curso: number }>(
      `SELECT (SELECT count(*)::int FROM estudiantes s WHERE s.generacion_id = $1 AND s.activo) AS estudiantes,
              (SELECT count(*)::int FROM entregas en JOIN dias d ON d.id = en.dia_id
                WHERE d.generacion_id = $1 AND en.estado = 'en_progreso') AS en_curso`,
      [id.data],
    ).then((r) => r.rows[0]),
  ]);
  if (!generacion) notFound();

  const programa = PROGRAMAS[generacion.programa];
  const publicados = dias.filter((d) => d.publicado).length;
  const conEjercicios = dias.filter((d) => d.ejercicios > 0).length;
  const listos = dias.filter((d) => !d.publicado && d.ejercicios > 0).length;
  // Días ya desbloqueados que los estudiantes todavía no pueden hacer.
  const atrasados = dias.filter((d) => d.desbloqueado && (!d.publicado || d.ejercicios === 0)).length;

  return (
    <>
      <TituloPagina
        antes={
          <Link href="/admin" className="font-semibold text-gris-oscuro hover:text-violeta">
            ← Generaciones
          </Link>
        }
        titulo={generacion.nombre}
        subtitulo={
          <>
            <span className="font-semibold">{generacion.codigo}</span> · {programa.etiqueta} · del{" "}
            {formatearFecha(generacion.fecha_inicio)} al {formatearFecha(generacion.fecha_fin)}
            {generacion.entrega_hasta && ` · entregas hasta el ${formatearFecha(generacion.entrega_hasta)}`}
          </>
        }
        acciones={
          esAdmin ? (
            <>
              <PublicarListos generacionId={generacion.id} listos={listos} />
              <BotonEnlace href={`/admin/progreso?generacion=${generacion.id}`} variante="secundario">
                Ver progreso
              </BotonEnlace>
              <EditarGeneracion generacion={generacion} />
              <InterruptorGeneracion
                generacionId={generacion.id}
                nombre={generacion.nombre}
                activa={generacion.activa}
                estudiantes={resumen.estudiantes}
                enCurso={resumen.en_curso}
              />
              <EliminarGeneracion generacionId={generacion.id} />
            </>
          ) : null
        }
      />

      {!generacion.activa && (
        <Aviso className="mb-5">
          Esta generación está <strong>desactivada</strong>: sus estudiantes entran y ven su progreso, pero no pueden
          hacer ejercicios.
        </Aviso>
      )}
      {atrasados > 0 && (
        <Aviso tono="error" className="mb-5">
          {atrasados === 1 ? "Hay 1 día" : `Hay ${atrasados} días`} cuya fecha ya llegó pero que los estudiantes aún no
          pueden hacer (sin ejercicios o sin publicar).
        </Aviso>
      )}

      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gris-oscuro">
        <span>
          <strong className="text-tinta">{conEjercicios}</strong> de {dias.length} días con ejercicios
        </span>
        <span>
          <strong className="text-tinta">{publicados}</strong> publicados
        </span>
        <span>
          <strong className="text-tinta">{resumen.estudiantes}</strong>{" "}
          {resumen.estudiantes === 1 ? "estudiante activo" : "estudiantes activos"}
        </span>
        <span>{programa.descripcion}</span>
      </div>

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
        {dias.map((d) => (
          <li key={d.id}>
            <TarjetaDia dia={d} programa={generacion.programa} estudiantes={resumen.estudiantes} />
          </li>
        ))}
      </ul>
    </>
  );
}

function TarjetaDia({ dia: d, programa, estudiantes }: { dia: DiaResumen; programa: Programa; estudiantes: number }) {
  const esperados = PROGRAMAS[programa].esperados;
  const estado = d.publicado
    ? d.desbloqueado
      ? { texto: "Visible", tono: "verde" as const }
      : { texto: "Programado", tono: "lavanda" as const }
    : { texto: "Sin publicar", tono: "gris" as const };
  const resumenTipos = TIPOS_EJERCICIO.filter((t) => d.tipos[t])
    .map((t) => contarTipo(t, d.tipos[t] ?? 0))
    .join(" · ");

  return (
    <Link href={`/admin/dias/${d.id}`} className="group block h-full rounded-[14px]">
      <Tarjeta
        relleno="p-4"
        className={`flex h-full flex-col gap-2 transition-shadow group-hover:shadow-[0_6px_20px_rgba(65,39,107,0.12)] ${
          d.es_hoy ? "!border-rosa" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
            {d.numero}
          </span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {d.es_hoy && <Insignia tono="rosa">Hoy</Insignia>}
            <Insignia tono={estado.tono}>{estado.texto}</Insignia>
          </div>
        </div>
        <div>
          <p className="text-[15px] font-extrabold text-titulo group-hover:text-violeta">
            Día {d.numero} · {formatearFecha(d.fecha)}
          </p>
          {d.titulo && <p className="truncate text-[13px] text-gris-oscuro">{d.titulo}</p>}
        </div>
        <p className={`text-[13px] ${d.ejercicios === 0 ? "font-semibold text-error-texto" : "text-gris-oscuro"}`}>
          {d.ejercicios === 0
            ? "Sin ejercicios"
            : `${resumenTipos}${d.ejercicios < esperados ? ` · faltan ${esperados - d.ejercicios}` : ""}`}
        </p>
        {d.entregas > 0 && (
          <p className="mt-auto text-[13px] text-gris-oscuro">
            <strong className="text-tinta">{d.entregas}</strong>
            {estudiantes > 0 && `/${estudiantes}`} entregas
            {d.promedio !== null && (
              <>
                {" "}
                · promedio <strong className="text-tinta">{d.promedio}</strong>
              </>
            )}
          </p>
        )}
      </Tarjeta>
    </Link>
  );
}

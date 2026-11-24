import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarGeneraciones } from "@/lib/datos/generaciones";
import { contarPorRevisar } from "@/lib/datos/progreso";
import { formatearFecha } from "@/lib/fechas";
import { PROGRAMAS } from "@/lib/tipos";
import { Aviso } from "@/app/components/ui/Aviso";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import CrearGeneracion from "./components/CrearGeneracion";
import { Cargando } from "./components/Cargando";

export const metadata: Metadata = { title: "Generaciones" };

export default function Generaciones({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Cargando />}>
      <ListaGeneraciones searchParams={searchParams} />
    </Suspense>
  );
}

async function ListaGeneraciones({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const staff = await staffParaPagina();
  const eliminada = (await searchParams).eliminada;
  const nombreEliminada = typeof eliminada === "string" ? eliminada.slice(0, 120) : null;
  const [generaciones, porRevisar] = await Promise.all([listarGeneraciones(), contarPorRevisar()]);

  return (
    <>
      <TituloPagina
        titulo="Generaciones"
        subtitulo="Cada generación tiene un día de ejercicios por fecha. Los días se desbloquean solos a las 12:00 a. m. (hora de Colombia)."
        acciones={staff.rol === "admin" ? <CrearGeneracion /> : null}
      />

      {nombreEliminada && (
        <Aviso tono="exito" className="mb-5">
          Eliminamos la generación «{nombreEliminada}» con sus días, estudiantes y entregas.
        </Aviso>
      )}

      {porRevisar > 0 && (
        <Aviso tono="error" className="mb-5">
          {porRevisar === 1 ? "Hay 1 entrega" : `Hay ${porRevisar} entregas`} a las que la IA no les pudo escribir el
          feedback.{" "}
          <Link href="/admin/progreso#por-revisar" className="font-bold underline">
            Revisar
          </Link>
        </Aviso>
      )}

      {generaciones.length === 0 ? (
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">Aún no hay generaciones.</p>
          <p className="mt-1 text-sm text-gris-oscuro">
            {staff.rol === "admin"
              ? "Crea la primera con «Crear generación» o corre db/002_vacaciones_2026.sql."
              : "Pídele a un administrador que cree la primera."}
          </p>
        </Tarjeta>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {generaciones.map((g) => (
            <li key={g.id}>
              <Link
                href={`/admin/generaciones/${g.id}`}
                className="group block rounded-[14px] focus-visible:outline-2 focus-visible:outline-rosa"
              >
                <Tarjeta className="h-full transition-shadow duration-150 group-hover:shadow-[0_6px_20px_rgba(65,39,107,0.12)]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Insignia tono="lavanda">{g.codigo}</Insignia>
                    <Insignia tono="violeta">{PROGRAMAS[g.programa].etiqueta}</Insignia>
                    {!g.activa && <Insignia tono="gris">Inactiva</Insignia>}
                  </div>
                  <h2 className="text-lg font-extrabold text-titulo group-hover:text-violeta">{g.nombre}</h2>
                  <p className="mt-0.5 text-sm text-gris-oscuro">
                    Del {formatearFecha(g.fecha_inicio)} al {formatearFecha(g.fecha_fin)}
                  </p>
                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-gris">Días publicados</dt>
                      <dd className="text-[17px] font-semibold text-tinta">
                        {g.publicados}
                        <span className="font-extrabold text-rosa-hover">/{g.dias}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gris">Estudiantes activos</dt>
                      <dd className="text-[17px] font-semibold text-tinta">{g.estudiantes}</dd>
                    </div>
                    <div>
                      <dt className="text-gris">Entregas</dt>
                      <dd className="text-[17px] font-semibold text-tinta">{g.entregas.toLocaleString("es-CO")}</dd>
                    </div>
                  </dl>
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

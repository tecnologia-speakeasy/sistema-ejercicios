import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarGeneraciones } from "@/lib/datos/generaciones";
import {
  columnasDias,
  listarPorRevisar,
  matrizProgreso,
  POR_PAGINA_PROGRESO,
  type CeldaProgreso,
} from "@/lib/datos/progreso";
import { formatearFechaHora } from "@/lib/fechas";
import { idUrlSchema } from "@/lib/validacion";
import { Aviso } from "@/app/components/ui/Aviso";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Entrada, Selector } from "@/app/components/ui/Campo";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Icono } from "@/app/components/ui/Icono";
import { Paginacion } from "@/app/components/ui/Paginacion";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import BotonReintentar from "./BotonReintentar";

export const metadata: Metadata = { title: "Progreso" };

// Progreso por generación: una fila por estudiante y una columna por día, con
// su puntaje (clic = ver la entrega). Arriba, las entregas a las que la IA no
// les pudo escribir el feedback.
export default function Progreso({ searchParams }: PageProps<"/admin/progreso">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function url(generacion: number, q: string, pagina = 1) {
  const p = new URLSearchParams({ generacion: String(generacion) });
  if (q) p.set("q", q);
  if (pagina > 1) p.set("pagina", String(pagina));
  return `/admin/progreso?${p}`;
}

function claseCelda(c: CeldaProgreso | undefined): string {
  if (!c) return "text-gris-claro";
  if (c.estado === "en_progreso") return "bg-lavanda text-violeta";
  if (c.puntaje === null) return "bg-lavanda text-violeta";
  if (c.puntaje >= 80) return "bg-[rgba(34,197,94,0.16)] text-exito";
  if (c.puntaje >= 60) return "bg-[rgba(250,204,21,0.22)] text-[#a16207]";
  return "bg-[rgba(239,68,68,0.12)] text-error";
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/admin/progreso">["searchParams"] }) {
  await staffParaPagina();
  const sp = await searchParams;
  const [generaciones, porRevisar] = await Promise.all([listarGeneraciones(), listarPorRevisar()]);

  if (generaciones.length === 0) {
    return (
      <>
        <TituloPagina titulo="Progreso" />
        <Tarjeta className="text-center">Aún no hay generaciones.</Tarjeta>
      </>
    );
  }

  const pedida = idUrlSchema.safeParse(primero(sp.generacion));
  const generacion =
    (pedida.success && generaciones.find((g) => g.id === pedida.data)) ||
    generaciones.find((g) => g.activa) ||
    generaciones[0];
  const q = primero(sp.q).trim().slice(0, 120);
  const pagina = Math.max(1, Number.parseInt(primero(sp.pagina), 10) || 1);
  const [columnas, { filas, total }] = await Promise.all([
    columnasDias(generacion.id),
    matrizProgreso(generacion.id, { q, pagina }),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_PROGRESO));
  const visibles = columnas.filter((c) => c.desbloqueado);

  return (
    <>
      <TituloPagina
        titulo="Progreso"
        subtitulo="El puntaje de cada estudiante en cada día. Toca un puntaje para ver lo que respondió."
        acciones={
          <BotonEnlace href={`/admin/progreso/exportar?generacion=${generacion.id}`} variante="secundario" prefetch={false}>
            <Icono nombre="descargar" className="size-[18px]" />
            Exportar CSV
          </BotonEnlace>
        }
      />

      {primero(sp.eliminada) === "1" && (
        <Aviso tono="exito" className="mb-5">
          Eliminamos la entrega. El estudiante puede volver a hacer ese día si sigue disponible.
        </Aviso>
      )}

      {porRevisar.length > 0 && (
        <section id="por-revisar" className="mb-7">
          <h2 className="mb-2 text-[17px] font-bold text-tinta">
            Por revisar <span className="font-semibold text-gris">({porRevisar.length})</span>
          </h2>
          <p className="mb-3 text-sm text-gris-oscuro">
            La IA no pudo escribir el feedback (o calificar la pregunta abierta) de estas entregas. El estudiante ya ve su
            puntaje automático; al reintentar se completa lo demás.
          </p>
          <ul className="flex flex-col gap-2">
            {porRevisar.map((r) => (
              <li key={r.id}>
                <Tarjeta relleno="px-4 py-3" className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-tinta">
                      {r.nombre} <span className="font-normal text-gris-oscuro">· {r.email}</span>
                    </p>
                    <p className="text-[13px] text-gris-oscuro">
                      {r.generacion} · Día {r.numero_dia} · entregado {formatearFechaHora(r.entregado)}
                      {r.ia_error && <span className="block truncate text-error-texto">{r.ia_error}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/entregas/${r.id}`} className="text-sm font-semibold text-violeta hover:underline">
                      Ver
                    </Link>
                    <BotonReintentar entregaId={r.id} />
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action="/admin/progreso" className="mb-4 flex flex-col gap-2.5 sm:flex-row">
        <Selector name="generacion" defaultValue={generacion.id} aria-label="Generación" className="sm:max-w-[320px]">
          {generaciones.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
            </option>
          ))}
        </Selector>
        <Entrada name="q" type="search" defaultValue={q} placeholder="Correo o nombre" aria-label="Buscar" />
        <button
          type="submit"
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-rosa px-[22px] py-[11px] text-sm font-semibold text-white hover:bg-rosa-hover"
        >
          <Icono nombre="buscar" className="size-[18px]" />
          Ver
        </button>
      </form>

      <p className="mb-3 text-sm text-gris-oscuro">
        <strong className="text-tinta">{total.toLocaleString("es-CO")}</strong> {total === 1 ? "estudiante" : "estudiantes"}
        {q && <> que coinciden con «{q}»</>} · {visibles.length} de {columnas.length} días desbloqueados
      </p>

      {filas.length === 0 ? (
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">{q ? "Ningún estudiante coincide." : "Esta generación aún no tiene estudiantes."}</p>
        </Tarjeta>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border-[1.5px] border-borde bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde-suave bg-campo text-left">
                <th scope="col" className="sticky left-0 z-[1] min-w-[220px] bg-campo px-3.5 py-2.5 font-bold text-tinta">
                  Estudiante
                </th>
                <th scope="col" className="px-2 py-2.5 text-center font-bold text-tinta" title="Días entregados">
                  Días
                </th>
                <th scope="col" className="px-2 py-2.5 text-center font-bold text-tinta">
                  Prom.
                </th>
                {columnas.map((c) => (
                  <th
                    key={c.fecha}
                    scope="col"
                    title={`Día ${c.numero} · ${c.fecha}${c.publicado ? "" : " (sin publicar)"}`}
                    className={`min-w-[38px] px-1 py-2.5 text-center text-xs font-bold ${c.desbloqueado ? "text-tinta" : "text-gris-claro"}`}
                  >
                    {c.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-borde-suave last:border-0">
                  <th scope="row" className="sticky left-0 z-[1] bg-white px-3.5 py-2 text-left font-normal">
                    <span className={`block truncate font-semibold ${f.activo ? "text-tinta" : "text-gris"}`}>
                      {f.nombre ?? f.email}
                    </span>
                    {f.nombre && <span className="block truncate text-xs text-gris-oscuro">{f.email}</span>}
                    {!f.activo && <span className="text-xs text-gris">Inactivo</span>}
                  </th>
                  <td className="px-2 py-2 text-center font-semibold text-tinta">
                    {f.completados}
                    <span className="text-xs text-gris">/{visibles.length}</span>
                  </td>
                  <td className="px-2 py-2 text-center font-extrabold text-tinta">{f.promedio ?? "—"}</td>
                  {columnas.map((c) => {
                    const celda = f.celdas[c.fecha];
                    const texto = !celda ? (c.desbloqueado ? "·" : "") : celda.estado === "en_progreso" ? "…" : (celda.puntaje ?? "IA");
                    return (
                      <td key={c.fecha} className="px-0.5 py-1 text-center">
                        {celda && celda.estado !== "en_progreso" ? (
                          <Link
                            href={`/admin/entregas/${celda.entrega_id}`}
                            className={`inline-flex h-7 min-w-[32px] items-center justify-center rounded-md px-1 text-xs font-bold hover:ring-2 hover:ring-rosa/40 ${claseCelda(celda)}`}
                          >
                            {texto}
                          </Link>
                        ) : (
                          <span
                            title={celda ? "En curso" : undefined}
                            className={`inline-flex h-7 min-w-[32px] items-center justify-center rounded-md text-xs ${claseCelda(celda)}`}
                          >
                            {texto}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gris-oscuro">
        <span>
          <span className="rounded bg-[rgba(34,197,94,0.16)] px-1.5 font-bold text-exito">80+</span> muy bien
        </span>
        <span>
          <span className="rounded bg-[rgba(250,204,21,0.22)] px-1.5 font-bold text-[#a16207]">60–79</span> bien
        </span>
        <span>
          <span className="rounded bg-[rgba(239,68,68,0.12)] px-1.5 font-bold text-error">&lt;60</span> a reforzar
        </span>
        <span>· sin entregar · … en curso · IA calificando la abierta</span>
      </p>
      <Paginacion pagina={pagina} paginas={paginas} href={(p) => url(generacion.id, q, p)} />
    </>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { BotonProgreso } from "@/app/components/progreso/BotonProgreso";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { Insignia, type TonoInsignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { diasDelEstudiante, type DiaEstudiante, type EstadoDia } from "@/lib/datos/entregas";
import { formatearFecha } from "@/lib/fechas";
import { PROGRAMAS } from "@/lib/tipos";

// Inicio del estudiante: sus días (se desbloquea uno cada día), la práctica de
// hoy, su resumen y "Mi progreso".
export default function Inicio() {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <Contenido />
      </Suspense>
    </div>
  );
}


const ESTADOS: Record<EstadoDia, { texto: string; tono: TonoInsignia }> = {
  bloqueado: { texto: "Bloqueado", tono: "gris" },
  sin_material: { texto: "Próximamente", tono: "lavanda" },
  disponible: { texto: "Disponible", tono: "verde" },
  en_curso: { texto: "En curso", tono: "rosa" },
  calificando: { texto: "Calificando", tono: "violeta" },
  completado: { texto: "Completado", tono: "violeta" },
  cerrado: { texto: "Sin entregar", tono: "rojo" },
};

// Días seguidos entregados que terminan hoy (o ayer, si hoy aún no lo hace).
function racha(dias: DiaEstudiante[]): number {
  const hasta = dias.findIndex((d) => d.es_hoy);
  let i = hasta === -1 ? dias.filter((d) => d.estado !== "bloqueado").length - 1 : hasta;
  const hecho = (d: DiaEstudiante) => d.estado === "completado" || d.estado === "calificando";
  if (i >= 0 && !hecho(dias[i])) i--;
  let n = 0;
  for (; i >= 0 && hecho(dias[i]); i--) n++;
  return n;
}

async function Contenido() {
  const estudiante = await estudianteParaPagina();
  const dias = await diasDelEstudiante(estudiante);
  const desbloqueados = dias.filter((d) => d.estado !== "bloqueado");
  const hechos = dias.filter((d) => d.estado === "completado" || d.estado === "calificando");
  const puntajes = hechos.flatMap((d) => (d.puntaje === null ? [] : [d.puntaje]));
  const promedio = puntajes.length ? Math.round(puntajes.reduce((s, p) => s + p, 0) / puntajes.length) : null;
  const hoy = dias.find((d) => d.es_hoy) ?? null;
  // Pendientes de días anteriores que todavía puede hacer.
  const atrasados = dias.filter((d) => !d.es_hoy && (d.estado === "disponible" || d.estado === "en_curso"));
  const programa = PROGRAMAS[estudiante.programa];
  const diasRacha = racha(dias);

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-[18px] pt-8 pb-12 md:px-7 md:pt-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-gris">{estudiante.generacion_nombre}</p>
            <h1 className="text-[clamp(26px,4vw,34px)] leading-tight font-extrabold text-marca">Hola, {estudiante.nombre}</h1>
            <p className="mt-1.5 max-w-[640px] text-[15px] text-gris-hub">{programa.descripcion}</p>
          </div>
          {hechos.length > 0 && (
            <BotonProgreso dias={desbloqueados.map((d) => ({ numero: d.numero, fecha: d.fecha, puntaje: d.puntaje }))} />
          )}
        </div>

        {!estudiante.generacion_activa && (
          <Tarjeta variante="lavanda" className="mb-6 text-[15px]">
            Tu generación está desactivada por ahora: puedes ver tu progreso, pero no hacer ejercicios.
          </Tarjeta>
        )}

        <dl className="mb-7 grid grid-cols-3 gap-2.5 sm:gap-4">
          <Dato titulo="Días completados" valor={`${hechos.length}`} sufijo={`/${dias.length}`} />
          <Dato titulo="Promedio" valor={promedio === null ? "—" : `${promedio}`} sufijo={promedio === null ? "" : "/100"} />
          <Dato titulo="Racha" valor={`${diasRacha}`} sufijo={diasRacha === 1 ? " día" : " días"} />
        </dl>

        {hoy && <TarjetaHoy dia={hoy} />}
        {atrasados.length > 0 && (
          <p className="mb-5 text-[15px] text-gris-oscuro">
            {atrasados.length === 1 ? "Tienes 1 día anterior pendiente" : `Tienes ${atrasados.length} días anteriores pendientes`}
            {estudiante.entrega_hasta ? `: puedes hacerlos hasta el ${formatearFecha(estudiante.entrega_hasta)}.` : "."}
          </p>
        )}

        {dias.length === 0 ? (
          <Tarjeta className="mx-auto flex max-w-[580px] flex-col items-center text-center">
            <p className="text-lg font-bold text-titulo">Aún no hay ejercicios</p>
            <p className="mt-1.5 text-[15px] text-gris-oscuro">Cuando tu coordinador los publique, aparecerán aquí.</p>
          </Tarjeta>
        ) : (
          <section aria-labelledby="titulo-dias">
            <h2 id="titulo-dias" className="mb-3.5 text-[17px] font-bold text-tinta">
              Tus días{" "}
              <span className="font-semibold text-gris">
                ({formatearFecha(estudiante.fecha_inicio)} – {formatearFecha(estudiante.fecha_fin)})
              </span>
            </h2>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-5">
              {dias.map((d) => (
                <li key={d.id}>
                  <TarjetaDia dia={d} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function Dato({ titulo, valor, sufijo }: { titulo: string; valor: string; sufijo: string }) {
  return (
    <Tarjeta relleno="px-3.5 py-3 sm:px-5 sm:py-4">
      <dt className="text-[12px] font-semibold text-gris sm:text-[13px]">{titulo}</dt>
      <dd className="text-[22px] leading-tight font-extrabold text-tinta sm:text-[26px]">
        {valor}
        <span className="text-sm font-bold text-rosa-hover">{sufijo}</span>
      </dd>
    </Tarjeta>
  );
}

function TarjetaHoy({ dia }: { dia: DiaEstudiante }) {
  const accion =
    dia.estado === "disponible"
      ? { texto: "Empezar la práctica de hoy", href: `/dia/${dia.fecha}` }
      : dia.estado === "en_curso"
        ? { texto: "Continuar la práctica de hoy", href: `/dia/${dia.fecha}` }
        : dia.estado === "completado" || dia.estado === "calificando"
          ? { texto: "Ver mi resultado", href: `/dia/${dia.fecha}/resultado` }
          : null;
  const texto =
    dia.estado === "completado"
      ? `¡Listo por hoy! Sacaste ${dia.puntaje}/100. Mañana se desbloquea otro día.`
      : dia.estado === "calificando"
        ? "Entregaste la práctica de hoy: estamos terminando de calificarla."
        : dia.estado === "sin_material"
          ? "La práctica de hoy aún no está lista. Vuelve en un rato."
          : dia.estado === "cerrado"
            ? "Ya no se reciben entregas."
            : `${dia.ejercicios} ${dia.ejercicios === 1 ? "ejercicio" : "ejercicios"} te esperan.`;
  return (
    <div className="degradado-tarjeta-movil mb-6 flex flex-col gap-4 rounded-[20px] px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-white/70">
          Hoy · Día {dia.numero} · {formatearFecha(dia.fecha)}
        </p>
        <p className="mt-1 text-[19px] leading-snug font-extrabold">{dia.titulo ?? "Práctica del día"}</p>
        <p className="mt-1 text-[15px] text-white/85">{texto}</p>
      </div>
      {accion && (
        <BotonEnlace href={accion.href} variante="degradado" tamano="lg" className="shrink-0">
          {accion.texto}
        </BotonEnlace>
      )}
    </div>
  );
}

function TarjetaDia({ dia }: { dia: DiaEstudiante }) {
  const estado = ESTADOS[dia.estado];
  const href =
    dia.estado === "completado" || dia.estado === "calificando"
      ? `/dia/${dia.fecha}/resultado`
      : dia.estado === "disponible" || dia.estado === "en_curso"
        ? `/dia/${dia.fecha}`
        : null;
  const contenido = (
    <Tarjeta
      relleno="p-3.5 sm:p-4"
      className={`flex h-full flex-col gap-2 transition-shadow ${href ? "group-hover:shadow-[0_6px_20px_rgba(65,39,107,0.12)]" : ""} ${
        dia.es_hoy ? "!border-rosa" : ""
      } ${dia.estado === "bloqueado" ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
          {dia.estado === "bloqueado" ? "🔒" : dia.numero}
        </span>
        <Insignia tono={estado.tono}>{dia.es_hoy && dia.estado === "disponible" ? "Hoy" : estado.texto}</Insignia>
      </div>
      <div>
        <p className="text-[15px] font-extrabold text-titulo">Día {dia.numero}</p>
        <p className="text-[13px] text-gris-oscuro">{formatearFecha(dia.fecha)}</p>
      </div>
      {dia.puntaje !== null && (
        <p className="mt-auto text-[20px] leading-tight font-extrabold text-tinta">
          {dia.puntaje}
          <span className="text-sm font-bold text-rosa-hover">/100</span>
        </p>
      )}
    </Tarjeta>
  );
  return href ? (
    <Link href={href} className="group block h-full rounded-[14px]">
      {contenido}
    </Link>
  ) : (
    <div className="h-full">{contenido}</div>
  );
}

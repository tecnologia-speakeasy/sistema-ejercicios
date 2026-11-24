import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { diaParaPracticar, sePuedePracticar, type DiaEstudiante } from "@/lib/datos/entregas";
import { formatearFecha } from "@/lib/fechas";
import { FECHA_URL } from "@/lib/tipos";
import Practica from "./Practica";

export const metadata: Metadata = { title: "Práctica del día" };

// La práctica de un día de su generación. Solo llegan ejercicios de
// v_ejercicios_publicos (sin transcripción, respuestas ni rúbrica) y solo si el
// día ya se desbloqueó. ?repetir=1: el segundo intento (desde el resultado).
export default function PaginaDia({ params, searchParams }: PageProps<"/dia/[fecha]">) {
  return (
    <Suspense fallback={<div className="fondo-intro min-h-screen flex-1" />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
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
  const repetir = sp.repetir === "1";
  const estudiante = await estudianteParaPagina(`/dia/${fecha}${repetir ? "?repetir=1" : ""}`);
  const datos = await diaParaPracticar(fecha, estudiante, { repetir });
  if (!datos) notFound();
  const { dia } = datos;

  if (!sePuedePracticar(dia, repetir)) {
    if (dia.estado === "completado" || dia.estado === "calificando") redirect(`/dia/${fecha}/resultado`);
    return <NoDisponible dia={dia} />;
  }

  // El intento en curso o el siguiente. Next conserva (oculta) la página ya
  // visitada: la key reinicia el estado con cada intento.
  const intento = datos.enCurso?.intento ?? dia.intentos + 1;
  return (
    <Practica
      key={`${dia.id}:${intento}:${datos.enCurso?.id ?? 0}`}
      dia={dia}
      intento={intento}
      ejercicios={datos.ejercicios}
      enCurso={datos.enCurso}
      nombre={estudiante.nombre}
      generacion={estudiante.generacion_nombre}
    />
  );
}

function NoDisponible({ dia }: { dia: DiaEstudiante }) {
  const texto = {
    bloqueado: {
      titulo: "Este día aún no se desbloquea",
      detalle: `Estará disponible el ${formatearFecha(dia.fecha)} desde las 12:00 a. m. (hora de Colombia).`,
    },
    sin_material: {
      titulo: "Este día aún no está listo",
      detalle: "Estamos preparando sus ejercicios. Vuelve más tarde.",
    },
    cerrado: {
      titulo: "Este día ya no recibe entregas",
      detalle: "Terminó el plazo para entregar los ejercicios, o tu generación está desactivada por ahora.",
    },
  }[dia.estado as "bloqueado" | "sin_material" | "cerrado"];

  return (
    <div className="fondo-intro relative flex min-h-screen flex-1 flex-col items-center justify-center p-6 text-center text-white">
      <Link href="/" className="absolute top-[22px] right-[30px] text-[15px] text-white/85 hover:text-white">
        Cerrar ✕
      </Link>
      <p className="mb-3 text-sm font-semibold text-white/60">
        Día {dia.numero} · {formatearFecha(dia.fecha)}
      </p>
      <h1 className="mb-4 text-[clamp(26px,5vw,40px)] leading-tight font-extrabold">{texto.titulo}</h1>
      <p className="mb-9 max-w-[460px] text-[16px] leading-relaxed text-white/80">{texto.detalle}</p>
      <Link
        href="/"
        className="degradado-boton w-full max-w-[320px] rounded-xl border-2 border-rosa px-6 py-[15px] text-base font-bold text-white shadow-[0_10px_34px_rgba(255,50,125,0.4)]"
      >
        Volver al inicio
      </Link>
    </div>
  );
}

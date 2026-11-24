"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarraProgreso } from "@/app/components/examen/BarraProgreso";
import { PantallaCalificando } from "@/app/components/examen/PantallaCalificando";
import { useAutoguardado, type EstadoGuardado } from "@/app/components/examen/useAutoguardado";
import {
  EjercicioEstudiante,
  respondido,
  tituloEjercicio,
  type RespuestaEjercicio,
} from "@/app/components/ejercicios/EjercicioEstudiante";
import { Encabezado } from "@/app/components/ui/Encabezado";
import type { DiaEstudiante, EjercicioPublico, EntregaEnCurso } from "@/lib/datos/entregas";
import type { Respuestas } from "@/lib/ejercicios/respuestas";
import { formatearFecha } from "@/lib/fechas";
import { MAX_INTENTOS } from "@/lib/tipos";

// La práctica de un día, con el UX del examen de sistema-evaluaciones:
//   intro → un ejercicio por pantalla → "Estás entregando el día" →
//   calificando (Spiky) → resultado (/dia/[fecha]/resultado).
// El intento lo crea el servidor al tocar "Comenzar" y se retoma si recarga.
// Las respuestas se guardan solas. Hay MAX_INTENTOS por día: cuenta el mejor.

const MIN_CALIFICANDO_MS = 2500;
const CONSULTA_ESTADO_MS = 4000;
const DEMORA_IA_MS = 45_000;
const SIN_CONEXION = "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

export default function Practica({
  dia,
  intento: intentoInicial,
  ejercicios,
  enCurso,
  nombre,
  generacion,
}: {
  dia: DiaEstudiante;
  /** El intento en curso o el que va a empezar (1 o 2). */
  intento: number;
  ejercicios: EjercicioPublico[];
  enCurso: EntregaEnCurso | null;
  nombre: string;
  generacion: string;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<"intro" | "practica" | "confirmar" | "calificando">("intro");
  const [entregaId, setEntregaId] = useState<number | null>(null);
  const [intento, setIntento] = useState(intentoInicial);
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [indice, setIndice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorIntro, setErrorIntro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [calificado, setCalificado] = useState(false);
  const [demorado, setDemorado] = useState(false);
  const enviando = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const resultado = `/dia/${dia.fecha}/resultado`;
  const total = ejercicios.length;
  const ejercicio = ejercicios[indice];

  const enviarRef = useRef<() => Promise<void>>(async () => {});
  const {
    estado: estadoGuardado,
    marcarGuardado,
    detener: detenerGuardado,
    reanudar: reanudarGuardado,
  } = useAutoguardado({
    entregaId,
    datos: { respuestas },
    alCerrarse: (motivo) => {
      // Terminó el plazo: el servidor califica lo guardado. Ya entregado: al resultado.
      if (motivo === "fuera_de_plazo") void enviarRef.current();
      else router.replace(resultado);
    },
  });

  // Consulta el estado cada 4 s hasta que la IA termine. A los 45 s ofrece ir
  // al resultado. Devuelve false si el estudiante salió de la pantalla.
  const esperarIA = useCallback(async (id: number, desde: number): Promise<boolean> => {
    let avisado = false;
    while (montado.current) {
      await new Promise((r) => setTimeout(r, CONSULTA_ESTADO_MS));
      if (!montado.current) return false;
      if (!avisado && Date.now() - desde > DEMORA_IA_MS) {
        avisado = true;
        setDemorado(true);
      }
      try {
        const res = await fetch(`/api/entregas/${id}/estado`, { cache: "no-store" });
        if (res.ok && (await res.json())?.estado === "listo") return true;
      } catch {
        // Sin conexión: sigue esperando.
      }
    }
    return false;
  }, []);

  const enviar = useCallback(async () => {
    if (!entregaId || enviando.current) return;
    enviando.current = true;
    detenerGuardado();
    setError(null);
    setCalificado(false);
    setFase("calificando");
    const desde = Date.now();
    try {
      const res = await fetch(`/api/entregas/${entregaId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.estado) throw new Error(data?.error ?? SIN_CONEXION);
      if (data.estado !== "listo") {
        const listo = await esperarIA(entregaId, desde);
        if (!listo) return;
      }
      setCalificado(true);
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_CALIFICANDO_MS - (Date.now() - desde)) + 600));
      router.replace(resultado);
    } catch (e) {
      enviando.current = false;
      reanudarGuardado();
      setFase("practica");
      const mensaje = e instanceof Error && e.message !== SIN_CONEXION ? e.message : null;
      setError(mensaje ?? "No pudimos entregar. Revisa tu conexión e inténtalo de nuevo: tus respuestas están guardadas.");
    }
  }, [entregaId, respuestas, resultado, router, detenerGuardado, reanudarGuardado, esperarIA]);

  useEffect(() => {
    enviarRef.current = enviar;
  });

  async function comenzar() {
    setIniciando(true);
    setErrorIntro(null);
    try {
      const res = await fetch("/api/entregas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diaId: dia.id, intento }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? SIN_CONEXION);
      if (data.tipo === "finalizado") {
        router.replace(resultado);
        return;
      }
      const en = data.entrega as EntregaEnCurso;
      setEntregaId(en.id);
      setIntento(en.intento);
      setRespuestas(en.borrador);
      marcarGuardado({ respuestas: en.borrador });
      // Retoma en el primer ejercicio sin responder.
      const pendiente = ejercicios.findIndex((e) => !respondido(e, en.borrador[String(e.id)]));
      setIndice(pendiente === -1 ? Math.max(0, total - 1) : pendiente);
      setFase("practica");
    } catch (e) {
      setErrorIntro(e instanceof Error && e.message ? e.message : SIN_CONEXION);
    } finally {
      setIniciando(false);
    }
  }

  if (fase === "intro") {
    return (
      <Intro
        dia={dia}
        intento={intento}
        total={total}
        audios={ejercicios.filter((e) => e.tipo !== "abierta").length}
        abiertas={ejercicios.filter((e) => e.tipo === "abierta").length}
        enCurso={Boolean(enCurso)}
        iniciando={iniciando}
        error={errorIntro}
        onComenzar={comenzar}
      />
    );
  }

  if (!ejercicio) return null;
  const respuestaActual = respuestas[String(ejercicio.id)];
  const actualRespondido = respondido(ejercicio, respuestaActual);
  const ultimo = indice >= total - 1;

  function cambiarRespuesta(r: RespuestaEjercicio) {
    setRespuestas((prev) => {
      const nuevas = { ...prev };
      if (r === null) delete nuevas[String(ejercicio.id)];
      else nuevas[String(ejercicio.id)] = r;
      return nuevas;
    });
    setError(null);
  }

  function siguiente() {
    if (!actualRespondido) return;
    if (ultimo) setFase("confirmar");
    else setIndice((i) => i + 1);
  }

  const sinResponder = ejercicios.filter((e) => !respondido(e, respuestas[String(e.id)])).length;

  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Encabezado nombre={nombre} detalle={generacion} salir />

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-start px-[18px] pt-[18px] pb-10 md:gap-7 md:px-7 md:pt-[34px] md:pb-12">
        <main className="min-w-0 flex-1">
          <BarraProgreso actual={indice + 1} total={total} contador={`${indice + 1}/${total}`} />

          <EjercicioEstudiante
            ejercicio={ejercicio}
            numero={indice + 1}
            respuesta={respuestaActual ?? null}
            onCambio={cambiarRespuesta}
          />

          {error && (
            <div
              role="alert"
              className="mt-[22px] rounded-[10px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3.5 py-2.5 text-sm text-error-texto"
            >
              {error}
            </div>
          )}

          <div className="mt-9 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0}
              className="cursor-pointer rounded-[10px] border-[1.5px] border-rosa bg-white px-[22px] py-[11px] text-sm font-semibold text-rosa disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={siguiente}
              disabled={!actualRespondido}
              title={actualRespondido ? undefined : "Responde el ejercicio para continuar"}
              className="cursor-pointer rounded-[10px] bg-rosa px-[26px] py-[11px] text-sm font-semibold text-white transition-colors hover:bg-rosa-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-rosa"
            >
              {ultimo ? "Entregar ✓" : "Siguiente →"}
            </button>
          </div>
          <IndicadorGuardado estado={estadoGuardado} />
        </main>

        {/* Escritorio: los ejercicios del día (xs.stepperCard) */}
        <aside className="hidden w-[270px] shrink-0 flex-col gap-[18px] md:flex">
          <div className="rounded-2xl bg-lavanda px-5 py-4">
            <p className="text-[13px] text-gris">Día {dia.numero}</p>
            <p className="text-[17px] font-extrabold text-tinta">{formatearFecha(dia.fecha)}</p>
            {dia.titulo && <p className="mt-0.5 text-sm text-gris-oscuro">{dia.titulo}</p>}
          </div>
          <nav aria-label="Ejercicios del día" className="max-h-[420px] overflow-y-auto rounded-2xl bg-lavanda px-[22px] py-[18px]">
            <ol>
              {ejercicios.map((e, i) => {
                const listo = respondido(e, respuestas[String(e.id)]);
                const actual = i === indice;
                const puede = i <= indice || listo;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={!puede}
                      aria-current={actual ? "step" : undefined}
                      onClick={() => {
                        setIndice(i);
                        setError(null);
                      }}
                      className="flex h-[34px] w-full cursor-pointer items-center gap-3 text-left disabled:cursor-not-allowed"
                    >
                      <span
                        className={`z-[1] shrink-0 rounded-full ${actual ? "size-[15px] shadow-[0_0_0_4px_rgba(255,50,125,0.18)]" : "size-[13px]"} ${
                          listo || actual ? "bg-rosa" : "border-2 border-borde-paso bg-white"
                        }`}
                      />
                      <span
                        className={`truncate text-sm ${actual ? "font-bold text-tinta" : listo ? "font-medium text-gris-oscuro" : "font-medium text-gris-claro"}`}
                      >
                        {tituloEjercicio(e, i + 1)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      </div>

      {fase === "confirmar" && (
        <div className="fondo-intro fixed inset-0 z-[200] flex flex-col items-center justify-center p-6 text-center">
          <button
            type="button"
            onClick={() => setFase("practica")}
            className="absolute top-6 right-8 cursor-pointer text-base text-white/85 hover:text-white"
          >
            Cerrar ✕
          </button>
          <h2 className="mb-5 max-w-[560px] text-[clamp(30px,6vw,46px)] leading-[1.2] font-extrabold text-white">
            Estás entregando el día {dia.numero}
          </h2>
          <p className="mb-[18px] max-w-[460px] text-base text-white/80">
            {sinResponder > 0
              ? `Te ${sinResponder === 1 ? "falta 1 ejercicio" : `faltan ${sinResponder} ejercicios`} por responder. `
              : ""}
            {intento < MAX_INTENTOS
              ? "Después verás tu puntaje y la retroalimentación, y podrás repetir el día una vez más: cuenta tu mejor intento."
              : "Es tu último intento: después verás tu puntaje, lo que decía cada audio y la retroalimentación. Cuenta tu mejor intento."}{" "}
            ¿Deseas continuar?
          </p>
          <button
            type="button"
            onClick={() => void enviar()}
            autoFocus
            className="degradado-boton w-[min(420px,80vw)] cursor-pointer rounded-xl py-3.5 text-[15px] font-semibold text-white"
          >
            Entregar
          </button>
        </div>
      )}

      {fase === "calificando" && <PantallaCalificando listo={calificado} demorado={demorado ? resultado : null} />}
    </div>
  );
}

function IndicadorGuardado({ estado }: { estado: EstadoGuardado }) {
  if (!estado) return null;
  const texto = {
    guardado: "✓ Respuestas guardadas",
    guardando: "Guardando…",
    sin_conexion: "Sin conexión: reintentando guardar…",
  }[estado];
  return (
    <p aria-live="polite" className={`mt-4 text-right text-[13px] ${estado === "sin_conexion" ? "text-error-texto" : "text-gris"}`}>
      {texto}
    </p>
  );
}

// Pantalla previa (styles.introPage de evaluaciones).
function Intro({
  dia,
  intento,
  total,
  audios,
  abiertas,
  enCurso,
  iniciando,
  error,
  onComenzar,
}: {
  dia: DiaEstudiante;
  intento: number;
  total: number;
  audios: number;
  abiertas: number;
  enCurso: boolean;
  iniciando: boolean;
  error: string | null;
  onComenzar: () => void;
}) {
  const partes = [
    audios ? `${audios} ${audios === 1 ? "audio" : "audios"}` : null,
    abiertas ? `${abiertas} ${abiertas === 1 ? "pregunta abierta" : "preguntas abiertas"}` : null,
  ].filter(Boolean);
  return (
    <div className="fondo-intro relative flex min-h-screen flex-1 flex-col items-center justify-center p-6 text-white">
      <Link href="/" className="absolute top-[22px] right-[30px] z-[2] text-[15px] text-white/85 hover:text-white">
        Cerrar ✕
      </Link>
      <div className="flex w-full max-w-[760px] animate-fade-up flex-col items-center text-center">
        <p className="mb-3 text-sm font-semibold tracking-wide text-white/60">
          Día {dia.numero} · {formatearFecha(dia.fecha)}
          {dia.titulo ? ` · ${dia.titulo}` : ""} · Intento {intento} de {MAX_INTENTOS}
        </p>
        <div className="mb-[46px] max-w-full text-left">
          <h1 className="mb-[18px] text-[clamp(26px,5.2vw,44px)] leading-[1.1] font-extrabold">
            {enCurso ? "Continúa tu práctica" : intento > 1 ? "Repite el día" : "Práctica del día"}
          </h1>
          <ul className="flex flex-col gap-2.5 text-[16px] leading-relaxed text-white/85 md:text-[17px]">
            <Punto>
              Hoy tienes {partes.join(" y ") || `${total} ejercicios`}. Escucha cada audio las veces que quieras (puedes
              bajarle la velocidad) y escribe exactamente lo que oyes.
            </Punto>
            <Punto>
              {enCurso
                ? "Tus respuestas están guardadas: sigues donde ibas."
                : "Tus respuestas se guardan solas mientras avanzas: puedes salir y continuar después."}
            </Punto>
            <Punto>
              {intento < MAX_INTENTOS
                ? `Tienes ${MAX_INTENTOS} intentos para este día y cuenta el mejor. Al entregar verás tu puntaje y la retroalimentación.`
                : dia.puntaje !== null
                  ? `Es tu último intento: cuenta el mejor (llevas ${dia.puntaje}/100). Al entregar verás también lo que decía cada audio.`
                  : "Es tu último intento: cuenta el mejor. Al entregar verás también lo que decía cada audio."}
            </Punto>
          </ul>
        </div>
        <button
          type="button"
          onClick={onComenzar}
          disabled={iniciando}
          className="degradado-boton w-full max-w-[320px] cursor-pointer rounded-xl border-2 border-rosa px-6 py-[15px] text-base font-bold text-white shadow-[0_10px_34px_rgba(255,50,125,0.4)] transition-transform hover:-translate-y-px disabled:cursor-wait disabled:opacity-90"
        >
          {iniciando ? "Un momento…" : enCurso ? "Continuar" : "Comenzar"}
        </button>
        {error && (
          <p role="alert" className="mt-4 max-w-[420px] text-sm text-error-claro">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-[11px]">
      <span
        aria-hidden
        className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/55 text-xs font-bold text-white/80"
      >
        i
      </span>
      <span>{children}</span>
    </li>
  );
}

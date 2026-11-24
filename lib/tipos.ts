// Tipos de dominio compartidos entre servidor y componentes.

export type Programa = "audio_largo" | "audios_cortos";
export type TipoEjercicio = "transcripcion" | "completar" | "abierta";
export type EstadoEntrega = "en_progreso" | "pendiente" | "calificando" | "listo" | "error";

export const PROGRAMAS_LISTA: Programa[] = ["audio_largo", "audios_cortos"];
export const TIPOS_EJERCICIO: TipoEjercicio[] = ["transcripcion", "completar", "abierta"];

type InfoPrograma = {
  /** Nombre corto para chips y selectores. */
  etiqueta: string;
  /** Qué lleva cada día (lo ven el admin y el estudiante). */
  descripcion: string;
  /** Tipos que se pueden agregar a un día de este programa. */
  tipos: TipoEjercicio[];
  /** Ejercicios que se esperan por día (el panel avisa si faltan). */
  esperados: number;
};

// G1 = audio_largo, G2 = audios_cortos.
export const PROGRAMAS: Record<Programa, InfoPrograma> = {
  audio_largo: {
    etiqueta: "Audio largo + pregunta abierta",
    descripcion:
      "Cada día: un audio largo para transcribir literalmente o completar el texto incompleto, y una pregunta abierta.",
    tipos: ["transcripcion", "completar", "abierta"],
    esperados: 2,
  },
  audios_cortos: {
    etiqueta: "10 audios cortos",
    descripcion: "Cada día: 10 audios cortos para transcribir literalmente.",
    tipos: ["transcripcion"],
    esperados: 10,
  },
};

// "10 transcripciones", "1 pregunta abierta"…
export function contarTipo(tipo: TipoEjercicio, n: number): string {
  const [uno, varios] = {
    transcripcion: ["transcripción", "transcripciones"],
    completar: ["texto para completar", "textos para completar"],
    abierta: ["pregunta abierta", "preguntas abiertas"],
  }[tipo];
  return `${n} ${n === 1 ? uno : varios}`;
}

export const ETIQUETA_TIPO: Record<TipoEjercicio, string> = {
  transcripcion: "Transcripción",
  completar: "Completar el texto",
  abierta: "Pregunta abierta",
};

// Instrucción por defecto (en inglés, como los exámenes); cada ejercicio
// puede traer la suya.
export const INSTRUCCION_POR_TIPO: Record<TipoEjercicio, string> = {
  transcripcion: "Listen to the audio and write exactly what you hear.",
  completar: "Listen to the audio and complete the missing words.",
  abierta: "Answer the question in English.",
};

// Peso por defecto en el puntaje del día. G1: el audio vale más que la abierta
// (70/30). G2: todos los audios valen lo mismo.
export function pesoPorDefecto(programa: Programa, tipo: TipoEjercicio): number {
  if (programa === "audios_cortos") return 10;
  return tipo === "abierta" ? 30 : 70;
}

/** Intentos por día y estudiante; cuenta el mejor. Igual que en db/003 (CHECK y validar_entrega). */
export const MAX_INTENTOS = 2;

// "2026-12-09" → número del día dentro de la generación (1, 2, …).
export function numeroDia(fecha: string, fechaInicio: string): number {
  const ms = Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${fechaInicio}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export const FECHA_URL = /^\d{4}-\d{2}-\d{2}$/;

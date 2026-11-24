import { z } from "zod";
import { leerMarcado } from "./completar";

// Lo que manda el editor del staff para crear o editar un ejercicio. Las reglas
// de forma también las revisa la BD (validar_ejercicio); aquí, los mensajes
// para el formulario. Puro: lo usan las Server Actions y las pruebas.

const opcional = (max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .max(max, mensaje)
    .transform((v) => v || null);

const audioUrl = z
  .string()
  .trim()
  .max(1000, "El enlace es demasiado largo")
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "El enlace debe empezar por https://")
  .transform((v) => v || null);

const peso = z.coerce
  .number({ error: "Escribe el peso" })
  .positive("El peso debe ser mayor que 0")
  .max(999, "El peso es demasiado grande");

const comunes = {
  titulo: opcional(200, "El título es demasiado largo"),
  instruccion: opcional(500, "La instrucción es demasiado larga"),
  peso,
};

export const entradaEjercicioSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("transcripcion"),
    ...comunes,
    audio_url: audioUrl.refine((v) => v !== null, "Sube el audio o pega su enlace"),
    transcripcion: z
      .string({ error: "Escribe lo que dice el audio" })
      .trim()
      .min(1, "Escribe lo que dice el audio: con eso se califica")
      .max(20_000, "La transcripción es demasiado larga"),
  }),
  z.object({
    tipo: z.literal("completar"),
    ...comunes,
    audio_url: audioUrl,
    /** Texto con las palabras que faltan entre [corchetes] (lib/ejercicios/completar.ts). */
    texto: z.string({ error: "Escribe el texto" }).max(20_000, "El texto es demasiado largo"),
  }),
  z.object({
    tipo: z.literal("abierta"),
    ...comunes,
    audio_url: audioUrl,
    enunciado: z
      .string({ error: "Escribe la pregunta" })
      .trim()
      .min(1, "Escribe la pregunta")
      .max(2000, "La pregunta es demasiado larga"),
    rubrica: opcional(3000, "La rúbrica es demasiado larga"),
  }),
]);

export type EntradaEjercicio = z.input<typeof entradaEjercicioSchema>;

/** Columnas de la tabla `ejercicios`. */
export type FilaEjercicio = {
  tipo: "transcripcion" | "completar" | "abierta";
  titulo: string | null;
  instruccion: string | null;
  audio_url: string | null;
  enunciado: string | null;
  transcripcion: string | null;
  respuestas: string[][] | null;
  rubrica: string | null;
  peso: number;
};

export type ResultadoFila = { ok: true; fila: FilaEjercicio } | { ok: false; error: string; campo: string };

export function aFilaEjercicio(e: z.output<typeof entradaEjercicioSchema>): ResultadoFila {
  const base = { tipo: e.tipo, titulo: e.titulo, instruccion: e.instruccion, peso: e.peso, audio_url: e.audio_url };
  switch (e.tipo) {
    case "transcripcion":
      return {
        ok: true,
        fila: { ...base, enunciado: null, transcripcion: e.transcripcion, respuestas: null, rubrica: null },
      };
    case "completar": {
      const m = leerMarcado(e.texto);
      if (!m.ok) return { ok: false, error: m.error, campo: "texto" };
      return {
        ok: true,
        fila: { ...base, enunciado: m.enunciado, transcripcion: null, respuestas: m.respuestas, rubrica: null },
      };
    }
    case "abierta":
      return {
        ok: true,
        fila: { ...base, enunciado: e.enunciado, transcripcion: null, respuestas: null, rubrica: e.rubrica },
      };
  }
}

// Varios audios de una vez (G2): título, audio y transcripción de cada uno.
export const variosAudiosSchema = z
  .array(
    z.object({
      titulo: opcional(200, "El título es demasiado largo"),
      audio_url: z
        .string()
        .trim()
        .refine((v) => /^https?:\/\/\S+$/i.test(v), "Falta el audio de una fila"),
      transcripcion: z
        .string()
        .trim()
        .min(1, "Escribe la transcripción de cada audio")
        .max(20_000, "Una transcripción es demasiado larga"),
    }),
  )
  .min(1, "Agrega al menos un audio")
  .max(30, "Máximo 30 audios a la vez");

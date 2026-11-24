import { normalize } from "@/lib/grading/normalize";
import type { TipoEjercicio } from "@/lib/tipos";
import { calificarTranscripcion, type DetalleTranscripcion } from "./transcripcion";

// Calificación automática en el servidor. Puro: sin BD.
//   transcripcion  precisión de palabras (lib/ejercicios/transcripcion.ts)
//   completar      espacios correctos / espacios (normalize() de evaluaciones)
//   abierta        la califica la IA (nota null mientras tanto). Vacía = 0.
// Cada ejercicio queda con una nota de 0 a 1; el día, con el promedio
// ponderado por el peso de cada ejercicio, de 0 a 100.

export type EjercicioParaCalificar = {
  id: number;
  tipo: TipoEjercicio;
  peso: number;
  transcripcion: string | null;
  /** JSONB tal cual: string[][] en completar. */
  respuestas: unknown;
};

export type RespuestaDada = string | string[] | null | undefined;

export type DetalleCompletar = { espacios: { dada: string; correcta: boolean }[] };
export type Detalle = DetalleTranscripcion | DetalleCompletar | null;

export type Calificacion = {
  /** Lo que se guarda en respuestas.respuesta (null = sin responder). */
  respuesta: string | string[] | null;
  /** 0–1. null = la IA aún no la califica (abierta con respuesta). */
  nota: number | null;
  detalle: Detalle;
};

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")) : []);

export function calificarEjercicio(e: EjercicioParaCalificar, dada: RespuestaDada): Calificacion {
  if (e.tipo === "completar") {
    const variantes = Array.isArray(e.respuestas) ? e.respuestas.map(textos) : [];
    const lista = Array.isArray(dada) ? dada : [];
    const espacios = variantes.map((v, i) => {
      const valor = String(lista[i] ?? "");
      const n = normalize(valor);
      return { dada: valor, correcta: n !== "" && v.some((a) => normalize(a) === n) };
    });
    const aciertos = espacios.filter((x) => x.correcta).length;
    const algo = espacios.some((x) => x.dada.trim() !== "");
    return {
      respuesta: algo ? espacios.map((x) => x.dada) : null,
      nota: variantes.length ? Math.round((aciertos / variantes.length) * 10_000) / 10_000 : 0,
      detalle: { espacios },
    };
  }

  const texto = typeof dada === "string" && dada.trim() !== "" ? dada : null;
  if (e.tipo === "abierta") {
    return { respuesta: texto, nota: texto === null ? 0 : null, detalle: null };
  }
  const { nota, detalle } = calificarTranscripcion(e.transcripcion ?? "", texto);
  return { respuesta: texto, nota: texto === null ? 0 : nota, detalle };
}

// Puntaje del día (0–100): Σ nota × peso / Σ peso. null si falta alguna nota (IA).
export function puntajeDia(items: { nota: number | null; peso: number }[]): number | null {
  if (items.some((i) => i.nota === null)) return null;
  const pesos = items.reduce((s, i) => s + i.peso, 0);
  if (pesos <= 0) return 0;
  const obtenido = items.reduce((s, i) => s + (i.nota ?? 0) * i.peso, 0);
  return Math.round((obtenido / pesos) * 100);
}

// Primera variante de cada espacio: lo que se le muestra después de entregar.
export function respuestasCorrectas(respuestas: unknown): string[] {
  return Array.isArray(respuestas) ? respuestas.map((v) => textos(v)[0] ?? "") : [];
}

export const porcentaje = (nota: number | null) => (nota === null ? null : Math.round(nota * 100));

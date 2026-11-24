import { z } from "zod";

// Lo que manda el navegador mientras practica: { [ejercicio_id]: respuesta }.
// Texto (transcripción, abierta) o un texto por espacio (completar). Los
// límites solo frenan abusos; los ejercicios que no son del día se ignoran.
export type Respuestas = Record<string, string | string[]>;

export const respuestasSchema = z
  .record(
    z.string().regex(/^\d{1,9}$/, "Ejercicio inválido"),
    z.union([z.string().max(20_000, "Respuesta demasiado larga"), z.array(z.string().max(500)).max(200)]),
  )
  .refine((r) => Object.keys(r).length <= 100, "Demasiadas respuestas");

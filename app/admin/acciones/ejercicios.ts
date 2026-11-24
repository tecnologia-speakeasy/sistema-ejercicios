"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, errorValidacion, type ResultadoAccion } from "@/lib/acciones";
import { actualizarTituloDia, cambiarPublicado } from "@/lib/datos/dias";
import * as datos from "@/lib/datos/ejercicios";
import { aFilaEjercicio, entradaEjercicioSchema, variosAudiosSchema } from "@/lib/ejercicios/entrada";
import { idSchema } from "@/lib/validacion";

// Días y ejercicios: admin y docente (el docente podrá preparar ejercicios en
// su panel). Todo se vuelve a validar aquí; la BD revisa la forma de nuevo.

async function ejecutar(fn: () => Promise<unknown>): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    await fn();
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

// id null = nuevo.
export async function guardarEjercicioAction(diaId: unknown, id: unknown, entrada: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    const dia = idSchema.parse(diaId);
    const p = entradaEjercicioSchema.safeParse(entrada);
    if (!p.success) return errorValidacion(p.error.issues);
    const f = aFilaEjercicio(p.data);
    if (!f.ok) return { ok: false, error: f.error, campo: f.campo };
    if (id === null) await datos.crearEjercicio(dia, f.fila);
    else await datos.actualizarEjercicio(idSchema.parse(id), f.fila);
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function crearVariosAudiosAction(diaId: unknown, audios: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    const dia = idSchema.parse(diaId);
    const p = variosAudiosSchema.safeParse(audios);
    if (!p.success) return errorValidacion(p.error.issues);
    await datos.crearVariosAudios(dia, p.data);
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function cambiarActivoEjercicioAction(id: unknown, activo: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.cambiarActivoEjercicio(idSchema.parse(id), z.boolean().parse(activo)));
}

export async function eliminarEjercicioAction(id: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.eliminarEjercicio(idSchema.parse(id)));
}

export async function moverEjercicioAction(id: unknown, direccion: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.moverEjercicio(idSchema.parse(id), z.enum(["arriba", "abajo"]).parse(direccion)));
}

export async function copiarEjerciciosAction(origenId: unknown, destinoId: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.copiarEjerciciosDe(idSchema.parse(origenId), idSchema.parse(destinoId)));
}

export async function cambiarPublicadoDiaAction(diaId: unknown, publicado: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => cambiarPublicado(idSchema.parse(diaId), z.boolean().parse(publicado)));
}

const tituloSchema = z
  .string()
  .trim()
  .max(120, "El título es demasiado largo")
  .transform((v) => v || null);

export async function tituloDiaAction(diaId: unknown, titulo: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => actualizarTituloDia(idSchema.parse(diaId), tituloSchema.parse(titulo)));
}

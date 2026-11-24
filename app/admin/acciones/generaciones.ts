"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, errorValidacion, type ResultadoAccion } from "@/lib/acciones";
import {
  actualizarGeneracion,
  cambiarActivaGeneracion,
  crearGeneracion,
  eliminarGeneracion,
  resumenEliminacion,
  type ResumenEliminacion,
} from "@/lib/datos/generaciones";
import { publicarListos } from "@/lib/datos/dias";
import { fechaSchema } from "@/lib/fechas";
import { PROGRAMAS_LISTA } from "@/lib/tipos";
import { idSchema } from "@/lib/validacion";

// Generaciones: solo admin.

const fechas = {
  nombre: z.string().trim().min(1, "Escribe el nombre").max(120, "El nombre es demasiado largo"),
  fecha_inicio: z.string().min(1, "Elige la fecha de inicio").pipe(fechaSchema),
  fecha_fin: z.string().min(1, "Elige la fecha de fin").pipe(fechaSchema),
  entrega_hasta: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(fechaSchema.nullable()),
};

const reglasFechas = <T extends { fecha_inicio: string; fecha_fin: string; entrega_hasta: string | null }>(
  s: z.ZodType<T>,
) =>
  s
    .refine((d) => d.fecha_fin >= d.fecha_inicio, {
      message: "La fecha de fin debe ser igual o posterior al inicio.",
      path: ["fecha_fin"],
    })
    .refine((d) => !d.entrega_hasta || d.entrega_hasta >= d.fecha_fin, {
      message: "El último día para entregar no puede ser antes del último día de ejercicios.",
      path: ["entrega_hasta"],
    });

const crearSchema = reglasFechas(
  z.object({
    codigo: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Usa solo minúsculas, números y guiones (ej. g1-vacaciones)."),
    programa: z.enum(PROGRAMAS_LISTA, { error: "Elige el programa" }),
    ...fechas,
  }),
);

const editarSchema = reglasFechas(z.object(fechas));

export async function crearGeneracionAction(datos: unknown): Promise<ResultadoAccion> {
  let id: number;
  try {
    await requireStaff(["admin"]);
    const p = crearSchema.safeParse(datos);
    if (!p.success) return errorValidacion(p.error.issues);
    id = await crearGeneracion(p.data);
  } catch (e) {
    return aResultadoError(e);
  }
  redirect(`/admin/generaciones/${id}`);
}

export async function editarGeneracionAction(id: unknown, datos: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff(["admin"]);
    const p = editarSchema.safeParse(datos);
    if (!p.success) return errorValidacion(p.error.issues);
    await actualizarGeneracion(idSchema.parse(id), p.data);
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function cambiarActivaGeneracionAction(id: unknown, activa: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff(["admin"]);
    await cambiarActivaGeneracion(idSchema.parse(id), z.boolean().parse(activa));
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export type ResultadoPublicar = { ok: true; publicados: number } | { ok: false; error: string };

export async function publicarListosAction(generacionId: unknown): Promise<ResultadoPublicar> {
  let publicados: number;
  try {
    await requireStaff(["admin"]);
    publicados = await publicarListos(idSchema.parse(generacionId));
  } catch (e) {
    const r = aResultadoError(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
  refresh();
  return { ok: true, publicados };
}

export type ResultadoResumenEliminacion = { ok: true; resumen: ResumenEliminacion } | { ok: false; error: string };

export async function resumenEliminacionAction(id: unknown): Promise<ResultadoResumenEliminacion> {
  try {
    await requireStaff(["admin"]);
    const resumen = await resumenEliminacion(idSchema.parse(id));
    if (!resumen) return { ok: false, error: "La generación no existe." };
    return { ok: true, resumen };
  } catch (e) {
    const r = aResultadoError(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
}

export async function eliminarGeneracionAction(id: unknown, codigo: unknown): Promise<ResultadoAccion> {
  let nombre: string;
  try {
    await requireStaff(["admin"]);
    nombre = (await eliminarGeneracion(idSchema.parse(id), z.string().max(100).parse(codigo))).nombre;
  } catch (e) {
    return aResultadoError(e);
  }
  redirect(`/admin?eliminada=${encodeURIComponent(nombre)}`);
}

"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, type ResultadoAccion } from "@/lib/acciones";
import { eliminarEntrega } from "@/lib/datos/progreso";
import { procesarEntrega } from "@/lib/ia/procesar";
import { idSchema } from "@/lib/validacion";

// "Reintentar IA" (admin y docente): ignora el tope de fallos automáticos.
export async function reintentarIAAction(id: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    const r = await procesarEntrega(idSchema.parse(id), { forzar: true });
    if (r === "ocupado") return { ok: false, error: "La IA ya la está calificando o ya quedó lista. Recarga en un momento." };
    if (r === "fallo") return { ok: false, error: "La IA volvió a fallar. Revisa el error e inténtalo más tarde." };
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

// Eliminar una entrega (solo admin, irreversible): el estudiante puede volver
// a hacer ese día si sigue disponible.
export async function eliminarEntregaAction(id: unknown): Promise<ResultadoAccion> {
  let generacion: number;
  try {
    await requireStaff(["admin"]);
    generacion = (await eliminarEntrega(idSchema.parse(id))).generacion_id;
  } catch (e) {
    return aResultadoError(e);
  }
  redirect(`/admin/progreso?generacion=${generacion}&eliminada=1`);
}

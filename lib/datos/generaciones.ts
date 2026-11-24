import { query, transaction } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import type { Programa } from "@/lib/tipos";

// Consultas de generaciones. Sin autorización: la hacen las Server Actions/páginas.
// Las fechas DATE se leen como texto para que no se corran por la zona horaria.

export type Generacion = {
  id: number;
  codigo: string;
  nombre: string;
  programa: Programa;
  fecha_inicio: string;
  fecha_fin: string;
  entrega_hasta: string | null;
  activa: boolean;
};

export type GeneracionResumen = Generacion & {
  dias: number;
  publicados: number;
  estudiantes: number;
  entregas: number;
};

export type DatosGeneracion = {
  codigo: string;
  nombre: string;
  programa: Programa;
  fecha_inicio: string;
  fecha_fin: string;
  entrega_hasta: string | null;
};

const COLUMNAS = `g.id, g.codigo, g.nombre, g.programa, g.fecha_inicio::text AS fecha_inicio,
                  g.fecha_fin::text AS fecha_fin, g.entrega_hasta::text AS entrega_hasta, g.activa`;

export async function listarGeneraciones(): Promise<GeneracionResumen[]> {
  const { rows } = await query<GeneracionResumen>(
    `SELECT ${COLUMNAS},
            (SELECT count(*)::int FROM dias d WHERE d.generacion_id = g.id)                 AS dias,
            (SELECT count(*)::int FROM dias d WHERE d.generacion_id = g.id AND d.publicado) AS publicados,
            (SELECT count(*)::int FROM estudiantes s WHERE s.generacion_id = g.id AND s.activo) AS estudiantes,
            (SELECT count(*)::int FROM entregas en JOIN dias d ON d.id = en.dia_id
              WHERE d.generacion_id = g.id AND en.estado <> 'en_progreso')                   AS entregas
       FROM generaciones g
      ORDER BY g.fecha_inicio DESC, g.codigo`,
  );
  return rows;
}

export async function obtenerGeneracion(id: number): Promise<Generacion | null> {
  const { rows } = await query<Generacion>(`SELECT ${COLUMNAS} FROM generaciones g WHERE g.id = $1`, [id]);
  return rows[0] ?? null;
}

// Crea la generación y un día por fecha (sin publicar), todo o nada.
export async function crearGeneracion(d: DatosGeneracion): Promise<number> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO generaciones (codigo, nombre, programa, fecha_inicio, fecha_fin, entrega_hasta)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [d.codigo, d.nombre, d.programa, d.fecha_inicio, d.fecha_fin, d.entrega_hasta],
    );
    await tx.query(`SELECT generar_dias($1)`, [rows[0].id]);
    return rows[0].id;
  });
}

// Nombre y fechas (el código y el programa no cambian). Al mover las fechas se
// crean los días nuevos y se borran los que quedan fuera, solo si están vacíos:
// si alguno tiene ejercicios o entregas, no se deja.
export async function actualizarGeneracion(
  id: number,
  d: Pick<DatosGeneracion, "nombre" | "fecha_inicio" | "fecha_fin" | "entrega_hasta">,
): Promise<void> {
  await transaction(async (tx) => {
    const { rows } = await tx.query(`SELECT 1 FROM generaciones WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows[0]) throw new ErrorNegocio("La generación no existe.");
    const { rows: fuera } = await tx.query<{ fecha: string }>(
      `SELECT d.fecha::text AS fecha FROM dias d
        WHERE d.generacion_id = $1 AND (d.fecha < $2::date OR d.fecha > $3::date)
          AND (EXISTS (SELECT 1 FROM ejercicios e WHERE e.dia_id = d.id)
               OR EXISTS (SELECT 1 FROM entregas en WHERE en.dia_id = d.id))
        ORDER BY d.fecha`,
      [id, d.fecha_inicio, d.fecha_fin],
    );
    if (fuera.length) {
      throw new ErrorNegocio(
        `Con esas fechas quedarían por fuera días que ya tienen ejercicios (${fuera
          .slice(0, 3)
          .map((f) => f.fecha)
          .join(", ")}${fuera.length > 3 ? "…" : ""}). Cambia las fechas o vacía esos días primero.`,
        "fecha_inicio",
      );
    }
    await tx.query(`DELETE FROM dias WHERE generacion_id = $1 AND (fecha < $2::date OR fecha > $3::date)`, [
      id,
      d.fecha_inicio,
      d.fecha_fin,
    ]);
    await tx.query(
      `UPDATE generaciones SET nombre = $2, fecha_inicio = $3, fecha_fin = $4, entrega_hasta = $5 WHERE id = $1`,
      [id, d.nombre, d.fecha_inicio, d.fecha_fin, d.entrega_hasta],
    );
    await tx.query(`SELECT generar_dias($1)`, [id]);
  });
}

// Desactivar no borra nada: sus estudiantes entran y ven su progreso, pero no
// empiezan ni continúan días (también validar_entrega).
export async function cambiarActivaGeneracion(id: number, activa: boolean): Promise<void> {
  const { rowCount } = await query(`UPDATE generaciones SET activa = $2 WHERE id = $1`, [id, activa]);
  if (!rowCount) throw new ErrorNegocio("La generación no existe.");
}

export type ResumenEliminacion = {
  codigo: string;
  nombre: string;
  dias_con_ejercicios: number;
  ejercicios: number;
  estudiantes: number;
  entregas: number;
};

const SQL_RESUMEN = `
  SELECT g.codigo, g.nombre,
         (SELECT count(DISTINCT e.dia_id)::int FROM ejercicios e JOIN dias d ON d.id = e.dia_id
           WHERE d.generacion_id = g.id) AS dias_con_ejercicios,
         (SELECT count(*)::int FROM ejercicios e JOIN dias d ON d.id = e.dia_id
           WHERE d.generacion_id = g.id) AS ejercicios,
         (SELECT count(*)::int FROM estudiantes s WHERE s.generacion_id = g.id) AS estudiantes,
         (SELECT count(*)::int FROM entregas en
           WHERE en.dia_id IN (SELECT id FROM dias WHERE generacion_id = g.id)
              OR en.estudiante_id IN (SELECT id FROM estudiantes WHERE generacion_id = g.id)) AS entregas
    FROM generaciones g WHERE g.id = $1`;

export async function resumenEliminacion(id: number): Promise<ResumenEliminacion | null> {
  const { rows } = await query<ResumenEliminacion>(SQL_RESUMEN, [id]);
  return rows[0] ?? null;
}

// Irreversible: la generación, sus días con sus ejercicios, sus estudiantes y
// todas las entregas. Se pide escribir el código para confirmar.
export async function eliminarGeneracion(id: number, codigoConfirmado: string): Promise<ResumenEliminacion> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ codigo: string }>(`SELECT codigo FROM generaciones WHERE id = $1 FOR UPDATE`, [
      id,
    ]);
    if (!rows[0]) throw new ErrorNegocio("La generación no existe.");
    if (rows[0].codigo !== codigoConfirmado.trim()) {
      throw new ErrorNegocio(`Escribe exactamente el código «${rows[0].codigo}» para confirmar.`, "codigo");
    }
    const { rows: resumen } = await tx.query<ResumenEliminacion>(SQL_RESUMEN, [id]);
    await tx.query(`DELETE FROM entregas WHERE dia_id IN (SELECT id FROM dias WHERE generacion_id = $1)`, [id]);
    await tx.query(`DELETE FROM estudiantes WHERE generacion_id = $1`, [id]);
    await tx.query(`DELETE FROM generaciones WHERE id = $1`, [id]);
    return resumen[0];
  });
}

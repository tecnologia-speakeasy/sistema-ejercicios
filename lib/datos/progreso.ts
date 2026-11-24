import "server-only";
import { query, transaction } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { sqlALocal } from "@/lib/fechas";
import type { EstadoEntrega } from "@/lib/tipos";
import { patronBusqueda } from "./estudiantes";

// Progreso de los estudiantes (panel del staff): la matriz estudiantes × días,
// las entregas que la IA no terminó y eliminar un intento para que lo repita.
// Cada día cuenta el MEJOR intento del estudiante.

export const POR_PAGINA_PROGRESO = 100;

/** Un estudiante en un día: su mejor intento entregado (o el que está en curso, si no ha entregado ninguno). */
export type CeldaProgreso = { entrega_id: number; estado: EstadoEntrega; puntaje: number | null; intentos: number };

export type FilaProgreso = {
  id: number;
  email: string;
  activo: boolean;
  nombre: string | null;
  /** fecha "YYYY-MM-DD" → su entrega de ese día. */
  celdas: Record<string, CeldaProgreso>;
  completados: number;
  promedio: number | null;
};

export type ColumnaDia = { fecha: string; numero: number; publicado: boolean; desbloqueado: boolean };

export async function columnasDias(generacionId: number): Promise<ColumnaDia[]> {
  const { rows } = await query<ColumnaDia>(
    `SELECT d.fecha::text AS fecha, (d.fecha - g.fecha_inicio + 1) AS numero, d.publicado,
            d.fecha <= hoy_bogota() AS desbloqueado
       FROM dias d JOIN generaciones g ON g.id = d.generacion_id
      WHERE d.generacion_id = $1 ORDER BY d.fecha`,
    [generacionId],
  );
  return rows;
}

export async function matrizProgreso(
  generacionId: number,
  { q = "", pagina = 1, limite = POR_PAGINA_PROGRESO }: { q?: string; pagina?: number; limite?: number } = {},
): Promise<{ filas: FilaProgreso[]; total: number }> {
  // Por día: el intento que representa la celda (el mejor entregado; si no
  // hay, el que está en curso) y cuántos intentos lleva (entregados).
  const { rows } = await query<FilaProgreso & { total: number }>(
    `WITH mejores AS (
       SELECT DISTINCT ON (en.estudiante_id, en.dia_id)
              en.estudiante_id, en.dia_id, d.fecha, en.id, en.estado, en.puntaje_total,
              count(*) FILTER (WHERE en.estado <> 'en_progreso')
                OVER (PARTITION BY en.estudiante_id, en.dia_id) AS intentos
         FROM entregas en JOIN dias d ON d.id = en.dia_id
        WHERE d.generacion_id = $1
        ORDER BY en.estudiante_id, en.dia_id, (en.estado = 'en_progreso'), en.puntaje_total DESC NULLS LAST, en.intento DESC)
     SELECT s.id, s.email::text AS email, s.activo,
            (SELECT en.nombre FROM entregas en WHERE en.estudiante_id = s.id ORDER BY en.started_at DESC LIMIT 1) AS nombre,
            coalesce((SELECT jsonb_object_agg(m.fecha::text, jsonb_build_object(
                        'entrega_id', m.id, 'estado', m.estado, 'puntaje', m.puntaje_total, 'intentos', m.intentos))
                        FROM mejores m WHERE m.estudiante_id = s.id), '{}'::jsonb) AS celdas,
            (SELECT count(*)::int FROM mejores m
              WHERE m.estudiante_id = s.id AND m.estado <> 'en_progreso') AS completados,
            (SELECT round(avg(m.puntaje_total))::int FROM mejores m
              WHERE m.estudiante_id = s.id AND m.estado <> 'en_progreso' AND m.puntaje_total IS NOT NULL) AS promedio,
            count(*) OVER ()::int AS total
       FROM estudiantes s
      WHERE s.generacion_id = $1
        AND ($2 = '' OR s.email ILIKE $3
             OR EXISTS (SELECT 1 FROM entregas en WHERE en.estudiante_id = s.id AND en.nombre ILIKE $3))
      ORDER BY s.email
      LIMIT $4 OFFSET $5`,
    [generacionId, q, patronBusqueda(q), limite, (pagina - 1) * limite],
  );
  return { filas: rows, total: rows[0]?.total ?? 0 };
}

// Entregas a las que la IA no les escribió el feedback: 'error' o pendientes
// hace más de 10 minutos (el estudiante cerró la página antes).
const SQL_POR_REVISAR = `
  en.estado = 'error'
  OR (en.estado IN ('pendiente', 'calificando') AND en.completed_at < now() - interval '10 minutes'
      AND (en.procesando_hasta IS NULL OR en.procesando_hasta < now()))`;

export async function contarPorRevisar(): Promise<number> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM entregas en WHERE ${SQL_POR_REVISAR}`);
  return rows[0]?.n ?? 0;
}

export type EntregaPorRevisar = {
  id: number;
  email: string;
  nombre: string;
  generacion: string;
  numero_dia: number;
  fecha: string;
  intento: number;
  estado: EstadoEntrega;
  ia_error: string | null;
  entregado: string | null;
};

export async function listarPorRevisar(): Promise<EntregaPorRevisar[]> {
  const { rows } = await query<EntregaPorRevisar>(
    `SELECT en.id, s.email::text AS email, en.nombre, g.nombre AS generacion,
            (d.fecha - g.fecha_inicio + 1) AS numero_dia, d.fecha::text AS fecha, en.intento, en.estado, en.ia_error,
            ${sqlALocal("en.completed_at")} AS entregado
       FROM entregas en JOIN dias d ON d.id = en.dia_id JOIN generaciones g ON g.id = d.generacion_id
       JOIN estudiantes s ON s.id = en.estudiante_id
      WHERE ${SQL_POR_REVISAR}
      ORDER BY en.completed_at
      LIMIT 100`,
  );
  return rows;
}

// Irreversible: se van sus respuestas, puntaje y feedback, y el estudiante
// recupera ese intento (si el día sigue disponible). Si borra el 1.º y hay un
// 2.º, este pasa a ser el 1.º. No mientras la IA lo califica.
export async function eliminarEntrega(id: number): Promise<{ fecha: string; generacion_id: number }> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{
      dia_id: number;
      estudiante_id: number;
      intento: number;
      fecha: string;
      generacion_id: number;
      ocupada: boolean;
    }>(
      `SELECT en.dia_id, en.estudiante_id, en.intento, d.fecha::text AS fecha, d.generacion_id,
              (en.estado = 'calificando' AND en.procesando_hasta > now()) AS ocupada
         FROM entregas en JOIN dias d ON d.id = en.dia_id WHERE en.id = $1
          FOR UPDATE OF en`,
      [id],
    );
    const r = rows[0];
    if (!r) throw new ErrorNegocio("La entrega no existe.");
    if (r.ocupada) throw new ErrorNegocio("La IA está calificando esta entrega en este momento. Inténtalo en un minuto.");
    await tx.query(`DELETE FROM entregas WHERE id = $1`, [id]);
    await tx.query(
      `UPDATE entregas SET intento = intento - 1
        WHERE dia_id = $1 AND estudiante_id = $2 AND intento > $3`,
      [r.dia_id, r.estudiante_id, r.intento],
    );
    return { fecha: r.fecha, generacion_id: r.generacion_id };
  });
}

// Filas para el CSV: una por estudiante con su puntaje de cada día.
export async function filasExportar(generacionId: number) {
  const [columnas, { filas }] = await Promise.all([
    columnasDias(generacionId),
    matrizProgreso(generacionId, { limite: 50_000 }),
  ]);
  return { columnas, filas };
}

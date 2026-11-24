import "server-only";
import { query } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { sqlALocal } from "@/lib/fechas";
import type { EstadoEntrega } from "@/lib/tipos";
import { patronBusqueda } from "./estudiantes";

// Progreso de los estudiantes (panel del staff): la matriz estudiantes × días,
// las entregas que la IA no terminó y eliminar una entrega para que la repita.

export const POR_PAGINA_PROGRESO = 100;

export type CeldaProgreso = { entrega_id: number; estado: EstadoEntrega; puntaje: number | null };

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
  const { rows } = await query<FilaProgreso & { total: number }>(
    `SELECT s.id, s.email::text AS email, s.activo,
            (SELECT en.nombre FROM entregas en WHERE en.estudiante_id = s.id ORDER BY en.started_at DESC LIMIT 1) AS nombre,
            coalesce((SELECT jsonb_object_agg(d.fecha::text, jsonb_build_object(
                        'entrega_id', en.id, 'estado', en.estado, 'puntaje', en.puntaje_total))
                        FROM entregas en JOIN dias d ON d.id = en.dia_id
                       WHERE en.estudiante_id = s.id AND d.generacion_id = $1), '{}'::jsonb) AS celdas,
            (SELECT count(*)::int FROM entregas en JOIN dias d ON d.id = en.dia_id
              WHERE en.estudiante_id = s.id AND d.generacion_id = $1 AND en.estado <> 'en_progreso') AS completados,
            (SELECT round(avg(en.puntaje_total))::int FROM entregas en JOIN dias d ON d.id = en.dia_id
              WHERE en.estudiante_id = s.id AND d.generacion_id = $1 AND en.puntaje_total IS NOT NULL) AS promedio,
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
  estado: EstadoEntrega;
  ia_error: string | null;
  entregado: string | null;
};

export async function listarPorRevisar(): Promise<EntregaPorRevisar[]> {
  const { rows } = await query<EntregaPorRevisar>(
    `SELECT en.id, s.email::text AS email, en.nombre, g.nombre AS generacion,
            (d.fecha - g.fecha_inicio + 1) AS numero_dia, d.fecha::text AS fecha, en.estado, en.ia_error,
            ${sqlALocal("en.completed_at")} AS entregado
       FROM entregas en JOIN dias d ON d.id = en.dia_id JOIN generaciones g ON g.id = d.generacion_id
       JOIN estudiantes s ON s.id = en.estudiante_id
      WHERE ${SQL_POR_REVISAR}
      ORDER BY en.completed_at
      LIMIT 100`,
  );
  return rows;
}

// Irreversible: se van sus respuestas, puntaje y feedback. El estudiante puede
// volver a hacer ese día (si sigue disponible). No mientras la IA la califica.
export async function eliminarEntrega(id: number): Promise<{ fecha: string; generacion_id: number }> {
  const { rows } = await query<{ fecha: string; generacion_id: number; ocupada: boolean }>(
    `WITH e AS (
       SELECT en.id, d.fecha::text AS fecha, d.generacion_id,
              (en.estado = 'calificando' AND en.procesando_hasta > now()) AS ocupada
         FROM entregas en JOIN dias d ON d.id = en.dia_id WHERE en.id = $1),
     borrada AS (DELETE FROM entregas WHERE id = (SELECT id FROM e WHERE NOT ocupada) RETURNING id)
     SELECT e.fecha, e.generacion_id, e.ocupada FROM e`,
    [id],
  );
  const r = rows[0];
  if (!r) throw new ErrorNegocio("La entrega no existe.");
  if (r.ocupada) throw new ErrorNegocio("La IA está calificando esta entrega en este momento. Inténtalo en un minuto.");
  return { fecha: r.fecha, generacion_id: r.generacion_id };
}

// Filas para el CSV: una por estudiante con su puntaje de cada día.
export async function filasExportar(generacionId: number) {
  const [columnas, { filas }] = await Promise.all([
    columnasDias(generacionId),
    matrizProgreso(generacionId, { limite: 50_000 }),
  ]);
  return { columnas, filas };
}

import { query } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import type { Programa, TipoEjercicio } from "@/lib/tipos";

// Días de una generación (panel del staff). Sin autorización: la hacen las
// Server Actions y las páginas.

export type DiaResumen = {
  id: number;
  fecha: string;
  numero: number;
  titulo: string | null;
  publicado: boolean;
  ejercicios: number;
  /** Cuántos de cada tipo (activos). */
  tipos: Partial<Record<TipoEjercicio, number>>;
  /** Estudiantes que ya lo entregaron (al menos un intento). */
  entregas: number;
  /** Promedio del mejor intento de cada estudiante. */
  promedio: number | null;
  /** Ya se desbloqueó (hoy en Bogotá o antes). */
  desbloqueado: boolean;
  es_hoy: boolean;
};

export async function listarDias(generacionId: number): Promise<DiaResumen[]> {
  const { rows } = await query<DiaResumen>(
    `SELECT d.id, d.fecha::text AS fecha, (d.fecha - g.fecha_inicio + 1) AS numero, d.titulo, d.publicado,
            (SELECT count(*)::int FROM ejercicios e WHERE e.dia_id = d.id AND e.activo) AS ejercicios,
            coalesce((SELECT jsonb_object_agg(t.tipo, t.n)
                        FROM (SELECT e.tipo, count(*)::int AS n FROM ejercicios e
                               WHERE e.dia_id = d.id AND e.activo GROUP BY e.tipo) t), '{}'::jsonb) AS tipos,
            (SELECT count(DISTINCT en.estudiante_id)::int FROM entregas en
              WHERE en.dia_id = d.id AND en.estado <> 'en_progreso') AS entregas,
            (SELECT round(avg(m.mejor))::int
               FROM (SELECT max(en.puntaje_total) AS mejor FROM entregas en
                      WHERE en.dia_id = d.id AND en.estado <> 'en_progreso'
                      GROUP BY en.estudiante_id) m) AS promedio,
            d.fecha <= hoy_bogota() AS desbloqueado,
            d.fecha = hoy_bogota() AS es_hoy
       FROM dias d JOIN generaciones g ON g.id = d.generacion_id
      WHERE d.generacion_id = $1
      ORDER BY d.fecha`,
    [generacionId],
  );
  return rows;
}

export type DiaStaff = {
  id: number;
  fecha: string;
  numero: number;
  titulo: string | null;
  publicado: boolean;
  desbloqueado: boolean;
  generacion_id: number;
  generacion_nombre: string;
  generacion_codigo: string;
  programa: Programa;
  /** Día anterior y siguiente de la misma generación (para navegar). */
  anterior: number | null;
  siguiente: number | null;
  entregas: number;
};

export async function obtenerDia(id: number): Promise<DiaStaff | null> {
  const { rows } = await query<DiaStaff>(
    `SELECT d.id, d.fecha::text AS fecha, (d.fecha - g.fecha_inicio + 1) AS numero, d.titulo, d.publicado,
            d.fecha <= hoy_bogota() AS desbloqueado,
            g.id AS generacion_id, g.nombre AS generacion_nombre, g.codigo AS generacion_codigo, g.programa,
            (SELECT x.id FROM dias x WHERE x.generacion_id = g.id AND x.fecha < d.fecha ORDER BY x.fecha DESC LIMIT 1) AS anterior,
            (SELECT x.id FROM dias x WHERE x.generacion_id = g.id AND x.fecha > d.fecha ORDER BY x.fecha LIMIT 1) AS siguiente,
            (SELECT count(*)::int FROM entregas en WHERE en.dia_id = d.id AND en.estado <> 'en_progreso') AS entregas
       FROM dias d JOIN generaciones g ON g.id = d.generacion_id
      WHERE d.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Publicar exige al menos un ejercicio activo.
export async function cambiarPublicado(id: number, publicado: boolean): Promise<void> {
  if (publicado) {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ejercicios WHERE dia_id = $1 AND activo`,
      [id],
    );
    if (!rows[0] || rows[0].n === 0) {
      throw new ErrorNegocio("Agrega al menos un ejercicio antes de publicar el día.");
    }
  }
  const { rowCount } = await query(`UPDATE dias SET publicado = $2 WHERE id = $1`, [id, publicado]);
  if (!rowCount) throw new ErrorNegocio("El día no existe.");
}

// Publica de una vez los días que ya tienen ejercicios (se desbloquean solos en su fecha).
export async function publicarListos(generacionId: number): Promise<number> {
  const { rowCount } = await query(
    `UPDATE dias d SET publicado = TRUE
      WHERE d.generacion_id = $1 AND NOT d.publicado
        AND EXISTS (SELECT 1 FROM ejercicios e WHERE e.dia_id = d.id AND e.activo)`,
    [generacionId],
  );
  return rowCount ?? 0;
}

export async function actualizarTituloDia(id: number, titulo: string | null): Promise<void> {
  const { rowCount } = await query(`UPDATE dias SET titulo = $2 WHERE id = $1`, [id, titulo]);
  if (!rowCount) throw new ErrorNegocio("El día no existe.");
}

// Días con ejercicios del mismo programa (de cualquier generación) para
// "Copiar de otro día".
export async function diasParaCopiar(diaId: number): Promise<{ id: number; etiqueta: string }[]> {
  const { rows } = await query<{ id: number; generacion: string; numero: number; fecha: string; ejercicios: number; titulo: string | null }>(
    `SELECT d.id, g.nombre AS generacion, (d.fecha - g.fecha_inicio + 1) AS numero, d.fecha::text AS fecha, d.titulo,
            (SELECT count(*)::int FROM ejercicios e WHERE e.dia_id = d.id AND e.activo) AS ejercicios
       FROM dias d JOIN generaciones g ON g.id = d.generacion_id
      WHERE g.programa = (SELECT g2.programa FROM dias d2 JOIN generaciones g2 ON g2.id = d2.generacion_id WHERE d2.id = $1)
        AND d.id <> $1
        AND EXISTS (SELECT 1 FROM ejercicios e WHERE e.dia_id = d.id AND e.activo)
      ORDER BY g.fecha_inicio DESC, g.id, d.fecha`,
    [diaId],
  );
  return rows.map((r) => ({
    id: r.id,
    etiqueta: `${r.generacion} · Día ${r.numero} (${r.fecha})${r.titulo ? ` · ${r.titulo}` : ""} · ${r.ejercicios} ${
      r.ejercicios === 1 ? "ejercicio" : "ejercicios"
    }`,
  }));
}

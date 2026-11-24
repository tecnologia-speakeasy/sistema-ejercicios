import "server-only";
import type { EstudianteActual } from "@/lib/auth/guards";
import { query, transaction } from "@/lib/db";
import { calificarEjercicio, puntajeDia, type EjercicioParaCalificar } from "@/lib/ejercicios/calificar";
import type { Respuestas } from "@/lib/ejercicios/respuestas";
import { ErrorNegocio } from "@/lib/errores";
import type { EstadoEntrega, TipoEjercicio } from "@/lib/tipos";

// Lo que hace el estudiante: ver sus días, empezar/retomar uno, guardar solo,
// entregar (se califica en el servidor) y ver su resultado. Una entrega por
// día. Las reglas de acceso las revisa también la BD (validar_entrega).

/** Al 3.er fallo de la IA la entrega pasa a 'error'. Relanzar solo se detiene a los 10. */
export const MAX_FALLOS_AUTOMATICOS = 10;

export type EstadoDia =
  | "bloqueado" // su fecha aún no llega
  | "sin_material" // ya llegó pero el staff no lo ha publicado
  | "disponible"
  | "en_curso"
  | "calificando" // entregado: la IA está escribiendo el feedback
  | "completado"
  | "cerrado"; // se pasó el plazo (o la generación está desactivada) sin entregarlo

export type DiaEstudiante = {
  id: number;
  fecha: string;
  numero: number;
  titulo: string | null;
  ejercicios: number;
  es_hoy: boolean;
  estado: EstadoDia;
  puntaje: number | null;
};

type FilaDia = {
  id: number;
  fecha: string;
  numero: number;
  titulo: string | null;
  publicado: boolean;
  ejercicios: number;
  futuro: boolean;
  es_hoy: boolean;
  plazo_vencido: boolean;
  entrega_estado: EstadoEntrega | null;
  puntaje_total: number | null;
};

const SQL_DIAS = `
  SELECT d.id, d.fecha::text AS fecha, (d.fecha - g.fecha_inicio + 1) AS numero, d.titulo, d.publicado,
         (SELECT count(*)::int FROM ejercicios e WHERE e.dia_id = d.id AND e.activo) AS ejercicios,
         d.fecha > hoy_bogota() AS futuro,
         d.fecha = hoy_bogota() AS es_hoy,
         (g.entrega_hasta IS NOT NULL AND hoy_bogota() > g.entrega_hasta) AS plazo_vencido,
         en.estado AS entrega_estado, en.puntaje_total
    FROM dias d
    JOIN generaciones g ON g.id = d.generacion_id
    LEFT JOIN entregas en ON en.dia_id = d.id AND en.estudiante_id = $1`;

function estadoDia(f: FilaDia, generacionActiva: boolean): EstadoDia {
  if (f.entrega_estado === "listo") return "completado";
  if (f.entrega_estado && f.entrega_estado !== "en_progreso") return "calificando";
  if (f.futuro) return "bloqueado";
  if (!f.publicado || f.ejercicios === 0) return "sin_material";
  if (f.plazo_vencido || !generacionActiva) return "cerrado";
  return f.entrega_estado === "en_progreso" ? "en_curso" : "disponible";
}

const aDia = (f: FilaDia, activa: boolean): DiaEstudiante => ({
  id: f.id,
  fecha: f.fecha,
  numero: f.numero,
  titulo: f.titulo,
  ejercicios: f.ejercicios,
  es_hoy: f.es_hoy,
  estado: estadoDia(f, activa),
  puntaje: f.puntaje_total,
});

export async function diasDelEstudiante(e: EstudianteActual): Promise<DiaEstudiante[]> {
  const { rows } = await query<FilaDia>(`${SQL_DIAS} WHERE d.generacion_id = $2 ORDER BY d.fecha`, [
    e.id,
    e.generacion_id,
  ]);
  return rows.map((f) => aDia(f, e.generacion_activa));
}

/** Lo que ve el estudiante de un ejercicio antes de entregar (sin lo secreto). */
export type EjercicioPublico = {
  id: number;
  orden: number;
  tipo: TipoEjercicio;
  titulo: string | null;
  instruccion: string | null;
  audio_url: string | null;
  enunciado: string | null;
  espacios: number | null;
};

export type EntregaEnCurso = { id: number; borrador: Respuestas };

export type DiaParaPracticar = {
  dia: DiaEstudiante;
  /** Vacío si el día no está disponible (no se mandan ejercicios de días bloqueados). */
  ejercicios: EjercicioPublico[];
  enCurso: EntregaEnCurso | null;
};

export async function diaParaPracticar(fecha: string, e: EstudianteActual): Promise<DiaParaPracticar | null> {
  const { rows } = await query<FilaDia>(`${SQL_DIAS} WHERE d.generacion_id = $2 AND d.fecha = $3::date`, [
    e.id,
    e.generacion_id,
    fecha,
  ]);
  if (!rows[0]) return null;
  const dia = aDia(rows[0], e.generacion_activa);
  if (dia.estado !== "disponible" && dia.estado !== "en_curso") return { dia, ejercicios: [], enCurso: null };

  const [{ rows: ejercicios }, { rows: entrega }] = await Promise.all([
    // Solo la vista pública: nunca la transcripción, las respuestas ni la rúbrica.
    query<EjercicioPublico>(
      `SELECT id, orden, tipo, titulo, instruccion, audio_url, enunciado, espacios
         FROM v_ejercicios_publicos WHERE dia_id = $1 ORDER BY orden`,
      [dia.id],
    ),
    query<{ id: number; borrador: Respuestas }>(
      `SELECT id, respuestas_borrador AS borrador FROM entregas
        WHERE dia_id = $1 AND estudiante_id = $2 AND estado = 'en_progreso'`,
      [dia.id, e.id],
    ),
  ]);
  return { dia, ejercicios, enCurso: entrega[0] ?? null };
}

export type InicioEntrega = { tipo: "en_curso"; entrega: EntregaEnCurso } | { tipo: "finalizado" };

// "Comenzar" / "Continuar": retoma la entrega en curso o crea la del día.
export async function iniciarOReanudar(diaId: number, e: EstudianteActual): Promise<InicioEntrega> {
  if (!e.generacion_activa) throw new ErrorNegocio("Tu generación está desactivada por ahora.");
  const buscar = async () =>
    (
      await query<{ id: number; estado: EstadoEntrega; borrador: Respuestas; plazo_vencido: boolean }>(
        `SELECT en.id, en.estado, en.respuestas_borrador AS borrador,
                (g.entrega_hasta IS NOT NULL AND hoy_bogota() > g.entrega_hasta) AS plazo_vencido
           FROM entregas en JOIN dias d ON d.id = en.dia_id JOIN generaciones g ON g.id = d.generacion_id
          WHERE en.dia_id = $1 AND en.estudiante_id = $2`,
        [diaId, e.id],
      )
    ).rows[0];

  let actual = await buscar();
  if (!actual) {
    try {
      // validar_entrega revisa: generación activa, día publicado y desbloqueado,
      // plazo, ejercicios y que el estudiante sea de esa generación.
      await query(
        `INSERT INTO entregas (dia_id, estudiante_id, nombre) VALUES ($1, $2, $3)
         ON CONFLICT (dia_id, estudiante_id) DO NOTHING`,
        [diaId, e.id, e.nombre],
      );
    } catch (err) {
      const pg = err as { code?: string; message?: string };
      if (pg.code === "P0001" && pg.message) throw new ErrorNegocio(`${pg.message}.`);
      throw err;
    }
    actual = await buscar();
    if (!actual) throw new ErrorNegocio("No pudimos empezar este día. Inténtalo de nuevo.");
  }
  if (actual.estado !== "en_progreso") return { tipo: "finalizado" };
  if (actual.plazo_vencido) throw new ErrorNegocio("El plazo para entregar los ejercicios ya terminó.");
  return { tipo: "en_curso", entrega: { id: actual.id, borrador: actual.borrador } };
}

export type ResultadoBorrador =
  | { ok: true }
  | { ok: false; motivo: "no_existe" | "enviado" | "fuera_de_plazo" | "generacion_inactiva" };

export async function guardarBorrador(
  entregaId: number,
  estudianteId: number,
  respuestas: Respuestas,
): Promise<ResultadoBorrador> {
  const { rows } = await query<{ estado: EstadoEntrega; activa: boolean; plazo_vencido: boolean; guardado: boolean }>(
    `WITH e AS (
       SELECT en.id, en.estado, g.activa,
              (g.entrega_hasta IS NOT NULL AND hoy_bogota() > g.entrega_hasta) AS plazo_vencido
         FROM entregas en JOIN dias d ON d.id = en.dia_id JOIN generaciones g ON g.id = d.generacion_id
        WHERE en.id = $1 AND en.estudiante_id = $2),
     u AS (
       UPDATE entregas SET respuestas_borrador = $3::jsonb
        WHERE id = (SELECT id FROM e WHERE estado = 'en_progreso' AND activa AND NOT plazo_vencido)
        RETURNING id)
     SELECT e.estado, e.activa, e.plazo_vencido, EXISTS (SELECT 1 FROM u) AS guardado FROM e`,
    [entregaId, estudianteId, JSON.stringify(respuestas)],
  );
  const r = rows[0];
  if (!r) return { ok: false, motivo: "no_existe" };
  if (r.guardado) return { ok: true };
  if (r.estado !== "en_progreso") return { ok: false, motivo: "enviado" };
  if (!r.activa) return { ok: false, motivo: "generacion_inactiva" };
  return { ok: false, motivo: "fuera_de_plazo" };
}

export type ResultadoEnvio = { estado: EstadoEntrega; fecha: string };

// "Entregar": califica lo automático, guarda las respuestas y deja la entrega
// 'pendiente' para la IA (feedback y, en G1, la pregunta abierta). Entregar dos
// veces da lo mismo. Pasado el plazo, se califica lo que quedó guardado.
export async function enviarEntrega(
  entregaId: number,
  estudianteId: number,
  respuestas: Respuestas,
): Promise<ResultadoEnvio | null> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{
      dia_id: number;
      fecha: string;
      estado: EstadoEntrega;
      borrador: Respuestas;
      activa: boolean;
      plazo_vencido: boolean;
    }>(
      `SELECT en.dia_id, d.fecha::text AS fecha, en.estado, en.respuestas_borrador AS borrador, g.activa,
              (g.entrega_hasta IS NOT NULL AND hoy_bogota() > g.entrega_hasta) AS plazo_vencido
         FROM entregas en JOIN dias d ON d.id = en.dia_id JOIN generaciones g ON g.id = d.generacion_id
        WHERE en.id = $1 AND en.estudiante_id = $2
          FOR UPDATE OF en`,
      [entregaId, estudianteId],
    );
    const en = rows[0];
    if (!en) return null;
    if (en.estado !== "en_progreso") return { estado: en.estado, fecha: en.fecha };
    if (!en.activa) throw new ErrorNegocio("Tu generación está desactivada por ahora: tus respuestas siguen guardadas.");

    const finales = en.plazo_vencido ? en.borrador : respuestas;
    const { rows: ejercicios } = await tx.query<EjercicioParaCalificar>(
      `SELECT id, tipo, peso::float8 AS peso, transcripcion, respuestas
         FROM ejercicios WHERE dia_id = $1 AND activo ORDER BY orden`,
      [en.dia_id],
    );
    const calificadas = ejercicios.map((ej) => ({ ej, c: calificarEjercicio(ej, finales[String(ej.id)]) }));

    await tx.query(
      `INSERT INTO respuestas (entrega_id, ejercicio_id, respuesta, nota, peso, detalle)
       SELECT $1, x.ejercicio_id, x.respuesta, x.nota, x.peso, x.detalle
         FROM jsonb_to_recordset($2::jsonb)
           AS x(ejercicio_id int, respuesta jsonb, nota numeric, peso numeric, detalle jsonb)
       ON CONFLICT (entrega_id, ejercicio_id) DO NOTHING`,
      [
        entregaId,
        JSON.stringify(
          calificadas.map(({ ej, c }) => ({
            ejercicio_id: ej.id,
            respuesta: c.respuesta,
            nota: c.nota,
            peso: ej.peso,
            detalle: c.detalle,
          })),
        ),
      ],
    );
    const puntaje = puntajeDia(calificadas.map(({ ej, c }) => ({ nota: c.nota, peso: ej.peso })));
    await tx.query(
      `UPDATE entregas
          SET estado = 'pendiente', puntaje_total = $2, respuestas_borrador = $3::jsonb, completed_at = now()
        WHERE id = $1`,
      [entregaId, puntaje, JSON.stringify(finales)],
    );
    return { estado: "pendiente", fecha: en.fecha };
  });
}

// La consulta la pantalla de "calificando" y el resultado pendiente. `relanzar`:
// la IA no terminó y nadie la está corriendo (se cortó o falló).
export async function estadoEntrega(
  entregaId: number,
  estudianteId: number,
): Promise<{ estado: EstadoEntrega; fecha: string; puntaje: number | null; relanzar: boolean } | null> {
  const { rows } = await query<{ estado: EstadoEntrega; fecha: string; puntaje: number | null; relanzar: boolean }>(
    `SELECT en.estado, d.fecha::text AS fecha, en.puntaje_total AS puntaje,
            (en.estado IN ('pendiente', 'error', 'calificando')
              AND (en.procesando_hasta IS NULL OR en.procesando_hasta < now())
              AND en.completed_at < now() - interval '20 seconds'
              AND en.ia_intentos < $3) AS relanzar
       FROM entregas en JOIN dias d ON d.id = en.dia_id
      WHERE en.id = $1 AND en.estudiante_id = $2`,
    [entregaId, estudianteId, MAX_FALLOS_AUTOMATICOS],
  );
  return rows[0] ?? null;
}

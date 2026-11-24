import "server-only";
import type { EstudianteActual } from "@/lib/auth/guards";
import { query } from "@/lib/db";
import type { Detalle } from "@/lib/ejercicios/calificar";
import { sinCorrectas } from "@/lib/ejercicios/ocultar";
import { sqlALocal } from "@/lib/fechas";
import type { EstadoEntrega, Programa, TipoEjercicio } from "@/lib/tipos";
import { diaDelEstudiante, type DiaEstudiante } from "./entregas";

// Un intento ya entregado, ejercicio por ejercicio: el resultado y la revisión
// del estudiante y la vista del staff. El estudiante ve lo que decía el audio y
// las respuestas correctas solo cuando usó sus intentos o cerró el plazo.

export type RespuestaRevision = {
  ejercicio_id: number;
  orden: number;
  tipo: TipoEjercicio;
  titulo: string | null;
  instruccion: string | null;
  audio_url: string | null;
  enunciado: string | null;
  /** Lo que dice el audio (transcripción). null si aún no la puede ver. */
  transcripcion: string | null;
  /** Variantes aceptadas por espacio (completar). null si aún no las puede ver. */
  correctas: string[][] | null;
  respuesta: string | string[] | null;
  /** 0–1; null mientras la IA califica la abierta. */
  nota: number | null;
  peso: number;
  detalle: Detalle;
  /** Comentario de la IA (abierta). */
  feedback: string | null;
};

/** Los intentos entregados del mismo estudiante en ese día. */
export type ResumenIntento = {
  id: number;
  numero: number;
  estado: EstadoEntrega;
  puntaje_total: number | null;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM". */
  entregado: string | null;
};

export type DetalleEntrega = {
  id: number;
  intento: number;
  estado: EstadoEntrega;
  puntaje_total: number | null;
  feedback: string | null;
  nombre: string;
  email: string;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM". */
  entregado: string | null;
  ia_error: string | null;
  procesando: boolean;
  dia: { id: number; fecha: string; numero: number; titulo: string | null };
  generacion: { id: number; nombre: string; programa: Programa };
  intentos: ResumenIntento[];
  respuestas: RespuestaRevision[];
};

export type RevisionEstudiante = DetalleEntrega & {
  /** El día para el estudiante: mejor puntaje, si puede repetir, si ya ve las correctas… */
  estadoDia: DiaEstudiante;
};

const SQL = `
  SELECT en.id, en.intento, en.estado, en.puntaje_total, en.feedback, en.nombre, s.email::text AS email,
         ${sqlALocal("en.completed_at")} AS entregado, en.ia_error,
         (en.estado = 'calificando' AND en.procesando_hasta > now()) AS procesando,
         json_build_object('id', d.id, 'fecha', d.fecha::text, 'numero', d.fecha - g.fecha_inicio + 1,
                           'titulo', d.titulo) AS dia,
         json_build_object('id', g.id, 'nombre', g.nombre, 'programa', g.programa) AS generacion,
         coalesce((
           SELECT json_agg(json_build_object(
                    'id', x.id, 'numero', x.intento, 'estado', x.estado, 'puntaje_total', x.puntaje_total,
                    'entregado', ${sqlALocal("x.completed_at")}) ORDER BY x.intento)
             FROM entregas x
            WHERE x.dia_id = en.dia_id AND x.estudiante_id = en.estudiante_id AND x.estado <> 'en_progreso'
         ), '[]'::json) AS intentos,
         coalesce((
           SELECT json_agg(json_build_object(
                    'ejercicio_id', e.id, 'orden', e.orden, 'tipo', e.tipo, 'titulo', e.titulo,
                    'instruccion', e.instruccion, 'audio_url', e.audio_url, 'enunciado', e.enunciado,
                    'transcripcion', e.transcripcion, 'correctas', e.respuestas,
                    'respuesta', r.respuesta, 'nota', r.nota::float8, 'peso', r.peso::float8,
                    'detalle', r.detalle, 'feedback', r.feedback) ORDER BY e.orden)
             FROM respuestas r JOIN ejercicios e ON e.id = r.ejercicio_id
            WHERE r.entrega_id = en.id), '[]'::json) AS respuestas
    FROM entregas en
    JOIN dias d ON d.id = en.dia_id
    JOIN generaciones g ON g.id = d.generacion_id
    JOIN estudiantes s ON s.id = en.estudiante_id`;

// Un intento entregado del estudiante en ese día: el pedido o, sin número, el
// último que entregó. null si no existe o aún no lo entrega.
export async function entregaDelEstudiante(
  fecha: string,
  intento: number | null,
  e: EstudianteActual,
): Promise<RevisionEstudiante | null> {
  const [estadoDia, { rows }] = await Promise.all([
    diaDelEstudiante(fecha, e),
    query<DetalleEntrega>(
      `${SQL}
        WHERE en.estudiante_id = $1 AND d.generacion_id = $2 AND d.fecha = $3::date AND en.estado <> 'en_progreso'
          AND en.intento = coalesce($4::int, (
                SELECT max(x.intento) FROM entregas x
                 WHERE x.dia_id = en.dia_id AND x.estudiante_id = en.estudiante_id AND x.estado <> 'en_progreso'))`,
      [e.id, e.generacion_id, fecha, intento],
    ),
  ]);
  const d = rows[0];
  if (!d || !estadoDia) return null;
  return {
    ...d,
    respuestas: estadoDia.correctas_visibles ? d.respuestas : d.respuestas.map(sinCorrectas),
    estadoDia,
  };
}

export async function entregaParaStaff(id: number): Promise<DetalleEntrega | null> {
  const { rows } = await query<DetalleEntrega>(`${SQL} WHERE en.id = $1`, [id]);
  return rows[0] ?? null;
}

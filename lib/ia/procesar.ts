import "server-only";
import { query, transaction } from "@/lib/db";
import { puntajeDia } from "@/lib/ejercicios/calificar";
import { MAX_FALLOS_AUTOMATICOS } from "@/lib/datos/entregas";
import type { Programa } from "@/lib/tipos";
import { llamarOpenAI } from "./openai";
import { leerSalidaEntrega, promptEntrega, type EjercicioParaIA } from "./prompts";

// Después de entregar (fuera de cualquier transacción) la IA califica las
// abiertas (G1) y escribe el feedback del día: UNA llamada a OpenAI por
// entrega. Sin correo: el resultado solo se ve en la plataforma.
//
//   pendiente ──tomar──▶ calificando ──▶ listo
//                             │
//                             └─ falla ─▶ pendiente (ia_intentos + 1) ─ al 3.º ─▶ error
//
// Lo lanzan: el envío (after()), la pantalla que espera (/estado, que lo
// relanza si quedó suelto) y el staff ("Reintentar IA"). El candado
// (procesando_hasta) garantiza que solo uno llama a la IA por entrega.

export const FALLOS_PARA_ERROR = 3;
/** Vence después del maxDuration de las rutas (300 s): si el proceso murió, otro lo retoma. */
const CANDADO_MIN = 6;

export type ResultadoProceso = "listo" | "fallo" | "ocupado";

type Tomada = { nombre: string; fecha: string; numero: number; programa: Programa; puntaje_total: number | null };

export async function procesarEntrega(
  entregaId: number,
  { forzar = false }: { forzar?: boolean } = {},
): Promise<ResultadoProceso> {
  const { rows: tomada } = await query<Tomada>(
    `UPDATE entregas en
        SET estado = 'calificando', procesando_hasta = now() + make_interval(mins => $2)
       FROM dias d JOIN generaciones g ON g.id = d.generacion_id
      WHERE en.id = $1 AND d.id = en.dia_id
        AND en.estado IN ('pendiente', 'error', 'calificando')
        AND (en.procesando_hasta IS NULL OR en.procesando_hasta < now())
        AND ($3 OR en.ia_intentos < $4)
      RETURNING en.nombre, d.fecha::text AS fecha, (d.fecha - g.fecha_inicio + 1) AS numero, g.programa,
                en.puntaje_total`,
    [entregaId, CANDADO_MIN, forzar, MAX_FALLOS_AUTOMATICOS],
  );
  const e = tomada[0];
  if (!e) return "ocupado";

  try {
    const { rows: items } = await query<EjercicioParaIA & { respuesta_id: string; peso: number }>(
      `SELECT r.id AS respuesta_id, e.id AS ejercicio_id, e.orden, e.tipo, e.titulo, e.enunciado, e.rubrica,
              r.respuesta, r.nota::float8 AS nota, r.peso::float8 AS peso, r.detalle, e.respuestas AS correctas
         FROM respuestas r JOIN ejercicios e ON e.id = r.ejercicio_id
        WHERE r.entrega_id = $1
        ORDER BY e.orden`,
      [entregaId],
    );
    const abiertas = items.filter((it) => it.tipo === "abierta" && it.nota === null);
    const salida = leerSalidaEntrega(
      await llamarOpenAI(promptEntrega(e.nombre, e, e.programa, items, e.puntaje_total), { temperatura: 0.4 }),
      abiertas.map((a) => a.ejercicio_id),
    );

    const calificadas = abiertas.map((a) => {
      const n = salida.abiertas.get(a.ejercicio_id)!;
      a.nota = n.nota / 10;
      return { id: a.respuesta_id, nota: a.nota, comentario: n.comentario };
    });
    const puntaje = puntajeDia(items.map((it) => ({ nota: it.nota, peso: it.peso })));

    await transaction(async (tx) => {
      if (calificadas.length) {
        await tx.query(
          `UPDATE respuestas r SET nota = x.nota, feedback = x.comentario
             FROM jsonb_to_recordset($1::jsonb) AS x(id bigint, nota numeric, comentario text)
            WHERE r.id = x.id`,
          [JSON.stringify(calificadas)],
        );
      }
      await tx.query(
        `UPDATE entregas
            SET feedback = $2, puntaje_total = $3, estado = 'listo', procesando_hasta = NULL, ia_error = NULL
          WHERE id = $1`,
        [entregaId, salida.feedback, puntaje],
      );
    });
    return "listo";
  } catch (err) {
    const mensaje = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`[ia] entrega ${entregaId}: ${mensaje}`);
    await query(
      `UPDATE entregas
          SET ia_intentos = ia_intentos + 1, ia_error = $2, procesando_hasta = NULL,
              estado = (CASE WHEN ia_intentos + 1 >= $3 THEN 'error' ELSE 'pendiente' END)::estado_entrega
        WHERE id = $1`,
      [entregaId, mensaje, FALLOS_PARA_ERROR],
    ).catch((x) => console.error(`[ia] no se pudo registrar el fallo de la entrega ${entregaId}`, x));
    return "fallo";
  }
}

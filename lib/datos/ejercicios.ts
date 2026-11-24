import { query, transaction, type Tx } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import type { FilaEjercicio } from "@/lib/ejercicios/entrada";
import { pesoPorDefecto, PROGRAMAS, type Programa, type TipoEjercicio } from "@/lib/tipos";

// Ejercicios de un día (panel del staff). Sin autorización: la hacen las
// Server Actions. Un ejercicio con respuestas no se borra (FK): se desactiva;
// sus puntajes ya dados no cambian aunque se edite.

export type EjercicioStaff = FilaEjercicio & {
  id: number;
  orden: number;
  activo: boolean;
  /** Entregas que ya lo respondieron. */
  respuestas_estudiantes: number;
};

export async function listarEjercicios(diaId: number): Promise<EjercicioStaff[]> {
  const { rows } = await query<EjercicioStaff>(
    `SELECT e.id, e.orden, e.tipo, e.titulo, e.instruccion, e.audio_url, e.enunciado, e.transcripcion,
            e.respuestas, e.rubrica, e.peso::float8 AS peso, e.activo,
            (SELECT count(*)::int FROM respuestas r WHERE r.ejercicio_id = e.id) AS respuestas_estudiantes
       FROM ejercicios e
      WHERE e.dia_id = $1
      ORDER BY e.orden`,
    [diaId],
  );
  return rows;
}

async function programaDelDia(diaId: number): Promise<Programa> {
  const { rows } = await query<{ programa: Programa }>(
    `SELECT g.programa FROM dias d JOIN generaciones g ON g.id = d.generacion_id WHERE d.id = $1`,
    [diaId],
  );
  if (!rows[0]) throw new ErrorNegocio("El día no existe.");
  return rows[0].programa;
}

function exigirTipoDelPrograma(programa: Programa, tipo: TipoEjercicio) {
  if (!PROGRAMAS[programa].tipos.includes(tipo)) {
    throw new ErrorNegocio(
      programa === "audios_cortos"
        ? "Esta generación solo lleva audios cortos para transcribir."
        : "Ese tipo de ejercicio no es de este programa.",
      "tipo",
    );
  }
}

const COLUMNAS_INSERT = `(dia_id, orden, tipo, titulo, instruccion, audio_url, enunciado, transcripcion, respuestas, rubrica, peso)`;

export async function crearEjercicio(diaId: number, f: FilaEjercicio): Promise<number> {
  exigirTipoDelPrograma(await programaDelDia(diaId), f.tipo);
  return transaction(async (tx) => {
    await tx.query(`SELECT 1 FROM dias WHERE id = $1 FOR UPDATE`, [diaId]);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO ejercicios ${COLUMNAS_INSERT}
       VALUES ($1, (SELECT coalesce(max(orden), 0) + 1 FROM ejercicios WHERE dia_id = $1),
               $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       RETURNING id`,
      [
        diaId,
        f.tipo,
        f.titulo,
        f.instruccion,
        f.audio_url,
        f.enunciado,
        f.transcripcion,
        f.respuestas === null ? null : JSON.stringify(f.respuestas),
        f.rubrica,
        f.peso,
      ],
    );
    return rows[0].id;
  });
}

// Varios audios de transcripción de una vez (subida múltiple del editor).
export async function crearVariosAudios(
  diaId: number,
  audios: { titulo: string | null; audio_url: string; transcripcion: string }[],
): Promise<number> {
  const programa = await programaDelDia(diaId);
  const peso = pesoPorDefecto(programa, "transcripcion");
  return transaction(async (tx) => {
    await tx.query(`SELECT 1 FROM dias WHERE id = $1 FOR UPDATE`, [diaId]);
    const { rowCount } = await tx.query(
      `INSERT INTO ejercicios ${COLUMNAS_INSERT}
       SELECT $1, (SELECT coalesce(max(orden), 0) FROM ejercicios WHERE dia_id = $1) + x.n,
              'transcripcion', x.titulo, NULL, x.audio_url, NULL, x.transcripcion, NULL, NULL, $3
         FROM jsonb_to_recordset($2::jsonb) WITH ORDINALITY AS x(titulo text, audio_url text, transcripcion text, n int)`,
      [diaId, JSON.stringify(audios), peso],
    );
    return rowCount ?? 0;
  });
}

export async function actualizarEjercicio(id: number, f: FilaEjercicio): Promise<void> {
  const { rows } = await query<{ tipo: TipoEjercicio; con_respuestas: boolean }>(
    `SELECT tipo, EXISTS (SELECT 1 FROM respuestas r WHERE r.ejercicio_id = e.id) AS con_respuestas
       FROM ejercicios e WHERE e.id = $1`,
    [id],
  );
  const actual = rows[0];
  if (!actual) throw new ErrorNegocio("El ejercicio no existe.");
  const { rows: prog } = await query<{ programa: Programa }>(
    `SELECT g.programa FROM ejercicios e JOIN dias d ON d.id = e.dia_id JOIN generaciones g ON g.id = d.generacion_id
      WHERE e.id = $1`,
    [id],
  );
  exigirTipoDelPrograma(prog[0].programa, f.tipo);
  if (actual.con_respuestas && actual.tipo !== f.tipo) {
    throw new ErrorNegocio("Ya tiene respuestas de estudiantes: no se puede cambiar de tipo.", "tipo");
  }
  await query(
    `UPDATE ejercicios
        SET tipo = $2, titulo = $3, instruccion = $4, audio_url = $5, enunciado = $6, transcripcion = $7,
            respuestas = $8::jsonb, rubrica = $9, peso = $10
      WHERE id = $1`,
    [
      id,
      f.tipo,
      f.titulo,
      f.instruccion,
      f.audio_url,
      f.enunciado,
      f.transcripcion,
      f.respuestas === null ? null : JSON.stringify(f.respuestas),
      f.rubrica,
      f.peso,
    ],
  );
}

export async function cambiarActivoEjercicio(id: number, activo: boolean): Promise<void> {
  const { rowCount } = await query(`UPDATE ejercicios SET activo = $2 WHERE id = $1`, [id, activo]);
  if (!rowCount) throw new ErrorNegocio("El ejercicio no existe.");
}

// Solo si nadie lo ha respondido (si no, se desactiva). Se reenumeran los demás.
export async function eliminarEjercicio(id: number): Promise<void> {
  await transaction(async (tx) => {
    const { rows } = await tx.query<{ dia_id: number }>(`SELECT dia_id FROM ejercicios WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows[0]) throw new ErrorNegocio("El ejercicio no existe.");
    const { rowCount } = await tx.query(`SELECT 1 FROM respuestas WHERE ejercicio_id = $1 LIMIT 1`, [id]);
    if (rowCount) throw new ErrorNegocio("Este ejercicio ya tiene respuestas de estudiantes: desactívalo en vez de borrarlo.");
    await tx.query(`DELETE FROM ejercicios WHERE id = $1`, [id]);
    await renumerar(tx, rows[0].dia_id);
  });
}

async function renumerar(tx: Tx, diaId: number) {
  await tx.query(
    `UPDATE ejercicios e SET orden = x.n
       FROM (SELECT id, row_number() OVER (ORDER BY orden)::int AS n FROM ejercicios WHERE dia_id = $1) x
      WHERE e.id = x.id AND e.orden <> x.n`,
    [diaId],
  );
}

// Sube o baja un puesto (UNIQUE diferido: el intercambio se valida al final).
export async function moverEjercicio(id: number, direccion: "arriba" | "abajo"): Promise<void> {
  await transaction(async (tx) => {
    const { rows } = await tx.query<{ dia_id: number; orden: number }>(
      `SELECT dia_id, orden FROM ejercicios WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new ErrorNegocio("El ejercicio no existe.");
    const { dia_id, orden } = rows[0];
    const { rows: vecino } = await tx.query<{ id: number; orden: number }>(
      direccion === "arriba"
        ? `SELECT id, orden FROM ejercicios WHERE dia_id = $1 AND orden < $2 ORDER BY orden DESC LIMIT 1 FOR UPDATE`
        : `SELECT id, orden FROM ejercicios WHERE dia_id = $1 AND orden > $2 ORDER BY orden LIMIT 1 FOR UPDATE`,
      [dia_id, orden],
    );
    if (!vecino[0]) return;
    await tx.query(`UPDATE ejercicios SET orden = $2 WHERE id = $1`, [id, vecino[0].orden]);
    await tx.query(`UPDATE ejercicios SET orden = $2 WHERE id = $1`, [vecino[0].id, orden]);
  });
}

// Copia los ejercicios activos de otro día (de cualquier generación del mismo
// programa) al final de este.
export async function copiarEjerciciosDe(origenId: number, destinoId: number): Promise<number> {
  if (origenId === destinoId) throw new ErrorNegocio("Elige otro día.");
  const [origen, destino] = await Promise.all([programaDelDia(origenId), programaDelDia(destinoId)]);
  if (origen !== destino) throw new ErrorNegocio("Solo se puede copiar desde un día del mismo programa.");
  return transaction(async (tx) => {
    await tx.query(`SELECT 1 FROM dias WHERE id = $1 FOR UPDATE`, [destinoId]);
    const { rowCount } = await tx.query(
      `INSERT INTO ejercicios ${COLUMNAS_INSERT}
       SELECT $2, (SELECT coalesce(max(orden), 0) FROM ejercicios WHERE dia_id = $2)
                  + row_number() OVER (ORDER BY o.orden),
              o.tipo, o.titulo, o.instruccion, o.audio_url, o.enunciado, o.transcripcion, o.respuestas, o.rubrica, o.peso
         FROM ejercicios o WHERE o.dia_id = $1 AND o.activo`,
      [origenId, destinoId],
    );
    return rowCount ?? 0;
  });
}

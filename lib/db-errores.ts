// Traduce errores de Postgres (triggers y constraints de db/001_schema.sql) a
// mensajes para el formulario. Las reglas viven en la BD; aquí solo se traducen
// (ver CLAUDE.md: no duplicar los triggers en la app).

export type ErrorTraducido = { mensaje: string; campo?: string };

type ErrorPg = {
  code?: string;
  constraint?: string;
  message?: string;
};

function esErrorPg(e: unknown): e is ErrorPg {
  return typeof e === "object" && e !== null && typeof (e as ErrorPg).code === "string";
}

// RAISE EXCEPTION de validar_pregunta y de las funciones (código P0001).
// Cada regla: patrón del mensaje original → campo del formulario + mensaje.
const MENSAJES_TRIGGER: {
  patron: RegExp;
  campo?: string;
  mensaje: (m: RegExpMatchArray) => string;
}[] = [
  {
    patron: /^Transcripción: sube el audio/,
    campo: "audio_url",
    mensaje: () => "Sube el audio o pega su enlace.",
  },
  {
    patron: /^Transcripción: escribe lo que dice el audio/,
    campo: "transcripcion",
    mensaje: () => "Escribe lo que dice el audio: con eso se califica.",
  },
  {
    patron: /^Completar: (escribe el texto|marca al menos un espacio)/,
    campo: "texto",
    mensaje: () => "Escribe el texto y marca entre [corchetes] las palabras que faltan.",
  },
  {
    patron: /^Completar: el texto tiene (\d+) espacios y hay (\d+) listas/,
    campo: "texto",
    mensaje: (m) => `El texto tiene ${m[1]} espacio(s) y hay respuestas para ${m[2]}. Revisa los corchetes.`,
  },
  {
    patron: /^Completar: cada espacio necesita al menos una respuesta/,
    campo: "texto",
    mensaje: () => "Cada espacio necesita al menos una respuesta entre los corchetes.",
  },
  {
    patron: /^Abierta: escribe la pregunta/,
    campo: "enunciado",
    mensaje: () => "Escribe la pregunta.",
  },
];

// Violaciones de UNIQUE (23505), CHECK (23514) y FK (23503) por nombre.
const MENSAJES_CONSTRAINT: Record<string, ErrorTraducido> = {
  generaciones_codigo_key: {
    campo: "codigo",
    mensaje: "Ya existe una generación con ese código.",
  },
  generaciones_codigo_check: {
    campo: "codigo",
    mensaje: "Usa solo minúsculas, números y guiones (ej. g1-vacaciones).",
  },
  generaciones_nombre_check: {
    campo: "nombre",
    mensaje: "Escribe el nombre.",
  },
  generaciones_fechas_check: {
    campo: "fecha_fin",
    mensaje: "La fecha de fin debe ser igual o posterior a la de inicio (máximo 120 días).",
  },
  generaciones_entrega_hasta_check: {
    campo: "entrega_hasta",
    mensaje: "El último día para entregar no puede ser antes del último día de ejercicios.",
  },
  staff_email_key: {
    campo: "email",
    mensaje: "Ya hay un miembro del staff con ese correo.",
  },
  estudiantes_email_key: {
    campo: "email",
    mensaje: "Ya hay un estudiante con ese correo.",
  },
  ejercicios_audio_url_check: {
    campo: "audio_url",
    mensaje: "El enlace del audio debe empezar por https://.",
  },
  ejercicios_peso_check: {
    campo: "peso",
    mensaje: "El peso debe ser mayor que 0.",
  },
  ejercicios_dia_id_orden_key: {
    mensaje: "Alguien más cambió el orden al mismo tiempo. Recarga la página e inténtalo de nuevo.",
  },
  respuestas_ejercicio_id_fkey: {
    mensaje: "Este ejercicio ya tiene respuestas: desactívalo en vez de borrarlo.",
  },
  entregas_dia_estudiante_intento_key: {
    mensaje: "Ya empezaste este intento.",
  },
  entregas_un_intento_en_curso: {
    mensaje: "Ya tienes un intento en curso de este día.",
  },
};

// Devuelve null si no es un error de Postgres reconocido.
export function traducirErrorBD(e: unknown): ErrorTraducido | null {
  if (!esErrorPg(e)) return null;

  if (e.code === "P0001" && e.message) {
    for (const regla of MENSAJES_TRIGGER) {
      const m = e.message.match(regla.patron);
      if (m) return { mensaje: regla.mensaje(m), campo: regla.campo };
    }
    // Otro RAISE EXCEPTION de la BD: ya viene en español y pensado para el usuario.
    return { mensaje: e.message };
  }

  if (
    (e.code === "23505" || e.code === "23514" || e.code === "23503") &&
    e.constraint &&
    MENSAJES_CONSTRAINT[e.constraint]
  ) {
    return MENSAJES_CONSTRAINT[e.constraint];
  }

  switch (e.code) {
    case "22001": // texto demasiado largo
    case "22003": // número fuera de rango (SMALLINT, NUMERIC(5,2))
      return { mensaje: "Uno de los valores es demasiado grande." };
    case "40001": // serialización
    case "40P01": // deadlock
      return { mensaje: "Hubo un cruce con otro cambio al mismo tiempo. Inténtalo de nuevo." };
  }
  return null;
}

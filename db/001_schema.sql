-- =====================================================================
-- Speak Easy · Sistema de ejercicios (práctica diaria por generación)
-- Schema: ejercicio  (misma base de datos que `evaluacion`, otro schema)
--
-- Contenido:
--   generaciones (con su programa) · estudiantes · staff · login_intentos
--   dias (uno por fecha, se desbloquean a las 00:00 de Bogotá)
--   ejercicios (3 tipos) · entregas (una por estudiante y día) · respuestas
--
-- Programas:
--   audio_largo   (G1): cada día 1 audio largo (transcribirlo literalmente o
--                       completar el texto incompleto) + 1 pregunta abierta.
--   audios_cortos (G2): cada día 10 audios cortos para transcribir literalmente.
--
-- Ejecutar UNA vez sobre la base (psql no acepta ?schema= en la URL):
--   psql "<DATABASE_URL sin ?schema=...>" -f db/001_schema.sql
-- Todo va en una transacción: si algo falla, no queda nada a medias.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;            -- emails sin distinguir mayúsculas

BEGIN;

CREATE SCHEMA IF NOT EXISTS ejercicio;
SET LOCAL search_path TO ejercicio, public;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
CREATE TYPE rol_staff           AS ENUM ('admin', 'docente');
CREATE TYPE programa_generacion AS ENUM ('audio_largo', 'audios_cortos');
CREATE TYPE tipo_ejercicio      AS ENUM ('transcripcion', 'completar', 'abierta');
CREATE TYPE estado_entrega      AS ENUM ('en_progreso', 'pendiente', 'calificando', 'listo', 'error');

-- updated_at automático
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- Fecha de hoy en Colombia: los días se desbloquean a las 00:00 de Bogotá.
CREATE FUNCTION hoy_bogota() RETURNS date AS $$
    SELECT (now() AT TIME ZONE 'America/Bogota')::date
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- 1. Generaciones (cohortes). El programa decide qué ejercicios lleva cada día.
-- ---------------------------------------------------------------------
CREATE TABLE generaciones (
    id            SERIAL PRIMARY KEY,
    codigo        TEXT UNIQUE NOT NULL CHECK (codigo ~ '^[a-z0-9][a-z0-9-]{0,39}$'), -- 'g1-vacaciones'
    nombre        TEXT NOT NULL CHECK (btrim(nombre) <> ''),
    programa      programa_generacion NOT NULL,
    fecha_inicio  DATE NOT NULL,          -- primer día que se desbloquea
    fecha_fin     DATE NOT NULL,          -- último día que se desbloquea
    entrega_hasta DATE,                   -- último día para entregar (NULL = sin límite)
    activa        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT generaciones_fechas_check
        CHECK (fecha_fin >= fecha_inicio AND fecha_fin - fecha_inicio < 120),
    CONSTRAINT generaciones_entrega_hasta_check
        CHECK (entrega_hasta IS NULL OR entrega_hasta >= fecha_fin)
);

-- ---------------------------------------------------------------------
-- 2. Estudiantes (estar aquí = estar autorizado). El nombre lo escriben al
--    entrar y queda en cada entrega.
-- ---------------------------------------------------------------------
CREATE TABLE estudiantes (
    id            SERIAL PRIMARY KEY,
    generacion_id INT NOT NULL REFERENCES generaciones(id),
    email         CITEXT UNIQUE NOT NULL,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = bloquear sin borrar
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_estudiantes_generacion ON estudiantes (generacion_id);

-- ---------------------------------------------------------------------
-- 3. Staff (admin hace todo; docente queda listo para el panel de profesores)
--    password_hash = scrypt generado por la app: 'scrypt$<salt>$<hash>'
-- ---------------------------------------------------------------------
CREATE TABLE staff (
    id                    SERIAL PRIMARY KEY,
    email                 CITEXT UNIQUE NOT NULL,
    nombre                TEXT NOT NULL,
    rol                   rol_staff NOT NULL DEFAULT 'docente',
    password_hash         TEXT NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
    activo                BOOLEAN NOT NULL DEFAULT TRUE,
    debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE,
    sesion_version        INT NOT NULL DEFAULT 0,
    ultimo_login          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Intentos de login del staff (la app bloquea con >= 5 fallos en 15 min).
CREATE TABLE login_intentos (
    id         BIGSERIAL PRIMARY KEY,
    email      CITEXT NOT NULL,
    ip         INET,
    exito      BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_intentos_email ON login_intentos (email, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. Días: uno por fecha entre fecha_inicio y fecha_fin (generar_dias).
--    El estudiante lo ve desde su fecha si está publicado y tiene ejercicios.
--    Número del día = fecha - fecha_inicio + 1 (se calcula, no se guarda).
-- ---------------------------------------------------------------------
CREATE TABLE dias (
    id            SERIAL PRIMARY KEY,
    generacion_id INT NOT NULL REFERENCES generaciones(id) ON DELETE CASCADE,
    fecha         DATE NOT NULL,
    titulo        TEXT,                       -- opcional: 'Daily routines'
    publicado     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (generacion_id, fecha)
);
CREATE TRIGGER trg_dias_updated BEFORE UPDATE ON dias
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Ejercicios
--
--   tipo           audio_url   enunciado (público)        secreto
--   -------------  ----------  -------------------------  -------------------------------
--   transcripcion  obligatorio  —                          transcripcion: lo que dice el audio
--   completar      opcional     texto con espacios ___     respuestas: [["usually","normally"], ...]
--                                                          (una lista de variantes POR CADA ___)
--   abierta        opcional     la pregunta                rubrica (opcional; la usa la IA)
--
--   peso: cuánto vale en el puntaje del día (G1: audio 70 / abierta 30;
--   G2: todos 10, es decir, todos valen lo mismo).
-- ---------------------------------------------------------------------
CREATE TABLE ejercicios (
    id            SERIAL PRIMARY KEY,
    dia_id        INT NOT NULL REFERENCES dias(id) ON DELETE CASCADE,
    orden         SMALLINT NOT NULL,
    tipo          tipo_ejercicio NOT NULL,
    titulo        TEXT,                       -- 'Audio 1', 'A day at the beach'
    instruccion   TEXT,                       -- opcional; si no, la de su tipo
    audio_url     TEXT CHECK (audio_url IS NULL OR audio_url ~ '^https?://'),
    enunciado     TEXT,
    transcripcion TEXT,
    respuestas    JSONB,
    rubrica       TEXT,
    peso          NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (peso > 0),
    activo        BOOLEAN NOT NULL DEFAULT TRUE,  -- desactivar en vez de borrar
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dia_id, orden) DEFERRABLE INITIALLY DEFERRED  -- permite reordenar
);
CREATE TRIGGER trg_ejercicios_updated BEFORE UPDATE ON ejercicios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Valida los campos según el tipo y limpia los que no aplican.
-- (Las funciones que leen tablas fijan su search_path: en esta misma base el
-- schema `evaluacion` tiene tablas con los mismos nombres.)
CREATE FUNCTION validar_ejercicio() RETURNS trigger AS $$
DECLARE r JSONB := NEW.respuestas; e JSONB; espacios INT;
BEGIN
    CASE NEW.tipo
    WHEN 'transcripcion' THEN
        IF NEW.audio_url IS NULL OR btrim(NEW.audio_url) = '' THEN
            RAISE EXCEPTION 'Transcripción: sube el audio o pega su enlace';
        END IF;
        IF NEW.transcripcion IS NULL OR btrim(NEW.transcripcion) = '' THEN
            RAISE EXCEPTION 'Transcripción: escribe lo que dice el audio';
        END IF;
        NEW.enunciado := NULL; NEW.respuestas := NULL; NEW.rubrica := NULL;

    WHEN 'completar' THEN
        IF NEW.enunciado IS NULL OR btrim(NEW.enunciado) = '' THEN
            RAISE EXCEPTION 'Completar: escribe el texto';
        END IF;
        espacios := (SELECT count(*) FROM regexp_matches(NEW.enunciado, '_{3,}', 'g'));
        IF espacios = 0 THEN
            RAISE EXCEPTION 'Completar: marca al menos un espacio';
        END IF;
        IF r IS NULL OR jsonb_typeof(r) <> 'array' OR jsonb_array_length(r) <> espacios THEN
            RAISE EXCEPTION 'Completar: el texto tiene % espacios y hay % listas de respuestas',
                            espacios, CASE WHEN jsonb_typeof(r) = 'array' THEN jsonb_array_length(r) ELSE 0 END;
        END IF;
        FOR e IN SELECT * FROM jsonb_array_elements(r) LOOP
            IF jsonb_typeof(e) <> 'array' OR jsonb_array_length(e) < 1 THEN
                RAISE EXCEPTION 'Completar: cada espacio necesita al menos una respuesta';
            END IF;
        END LOOP;
        NEW.transcripcion := NULL; NEW.rubrica := NULL;

    WHEN 'abierta' THEN
        IF NEW.enunciado IS NULL OR btrim(NEW.enunciado) = '' THEN
            RAISE EXCEPTION 'Abierta: escribe la pregunta';
        END IF;
        NEW.transcripcion := NULL; NEW.respuestas := NULL;
    END CASE;
    RETURN NEW;
END $$ LANGUAGE plpgsql
    SET search_path = ejercicio, public;

CREATE TRIGGER trg_validar_ejercicio BEFORE INSERT OR UPDATE ON ejercicios
FOR EACH ROW EXECUTE FUNCTION validar_ejercicio();

-- ---------------------------------------------------------------------
-- 6. Entregas: lo que hace un estudiante en un día. UNA por estudiante y día
--    (para que lo repita, el admin elimina su entrega).
--    Estados: en_progreso → (enviar) pendiente → calificando → listo
--             (si la IA falla vuelve a pendiente; al 3.er fallo, error).
-- ---------------------------------------------------------------------
CREATE TABLE entregas (
    id                  SERIAL PRIMARY KEY,
    dia_id              INT NOT NULL REFERENCES dias(id) ON DELETE CASCADE,
    estudiante_id       INT NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    nombre              TEXT NOT NULL,              -- el que escribió al entrar
    estado              estado_entrega NOT NULL DEFAULT 'en_progreso',
    puntaje_total       SMALLINT CHECK (puntaje_total BETWEEN 0 AND 100),
    feedback            TEXT,                       -- retroalimentación de la IA
    respuestas_borrador JSONB NOT NULL DEFAULT '{}'::jsonb,  -- autoguardado
    procesando_hasta    TIMESTAMPTZ,                -- candado de quien llama a la IA
    ia_intentos         SMALLINT NOT NULL DEFAULT 0,
    ia_error            TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    UNIQUE (dia_id, estudiante_id)
);
CREATE INDEX idx_entregas_estudiante ON entregas (estudiante_id);
CREATE INDEX idx_entregas_por_procesar ON entregas (estado)
    WHERE estado IN ('pendiente', 'calificando', 'error');

CREATE FUNCTION validar_entrega() RETURNS trigger AS $$
DECLARE d dias%ROWTYPE; g generaciones%ROWTYPE;
BEGIN
    SELECT * INTO d FROM dias WHERE id = NEW.dia_id;
    SELECT * INTO g FROM generaciones WHERE id = d.generacion_id;

    IF NOT g.activa THEN
        RAISE EXCEPTION 'Tu generación está desactivada por ahora';
    END IF;
    IF NOT d.publicado THEN
        RAISE EXCEPTION 'Este día todavía no está disponible';
    END IF;
    IF d.fecha > hoy_bogota() THEN
        RAISE EXCEPTION 'Este día todavía no se ha desbloqueado';
    END IF;
    IF g.entrega_hasta IS NOT NULL AND hoy_bogota() > g.entrega_hasta THEN
        RAISE EXCEPTION 'El plazo para entregar los ejercicios ya terminó';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ejercicios WHERE dia_id = d.id AND activo) THEN
        RAISE EXCEPTION 'Este día todavía no tiene ejercicios';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM estudiantes
                   WHERE id = NEW.estudiante_id AND generacion_id = d.generacion_id AND activo) THEN
        RAISE EXCEPTION 'Estudiante no autorizado para esta generación';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql
    SET search_path = ejercicio, public;

CREATE TRIGGER trg_validar_entrega BEFORE INSERT ON entregas
FOR EACH ROW EXECUTE FUNCTION validar_entrega();

-- ---------------------------------------------------------------------
-- 7. Respuestas: detalle por ejercicio, congelado al calificar.
--    nota: de 0 a 1 (transcripción = precisión de palabras; completar =
--    espacios correctos / total; abierta = nota de la IA / 10).
--    Un ejercicio con respuestas no se puede borrar (FK): se desactiva.
-- ---------------------------------------------------------------------
CREATE TABLE respuestas (
    id           BIGSERIAL PRIMARY KEY,
    entrega_id   INT NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
    ejercicio_id INT NOT NULL REFERENCES ejercicios(id),
    respuesta    JSONB,                -- "texto" | ["espacio 1", "espacio 2"]
    nota         NUMERIC(5,4) CHECK (nota BETWEEN 0 AND 1),  -- NULL mientras la IA califica
    peso         NUMERIC(5,2) NOT NULL,                       -- peso del ejercicio al entregar
    detalle      JSONB,                -- palabras alineadas / espacios acertados
    feedback     TEXT,                 -- comentario de la IA (abierta)
    UNIQUE (entrega_id, ejercicio_id)
);
CREATE INDEX idx_respuestas_ejercicio ON respuestas (ejercicio_id);

-- =====================================================================
-- Funciones de apoyo
-- =====================================================================

-- Crea los días que falten entre fecha_inicio y fecha_fin (sin publicar).
-- Idempotente.
CREATE FUNCTION generar_dias(p_generacion INT) RETURNS INT AS $$
DECLARE g generaciones%ROWTYPE; c INT;
BEGIN
    SELECT * INTO g FROM generaciones WHERE id = p_generacion;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generación % no existe', p_generacion; END IF;
    INSERT INTO dias (generacion_id, fecha)
    SELECT g.id, f::date
      FROM generate_series(g.fecha_inicio, g.fecha_fin, interval '1 day') AS f
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS c = ROW_COUNT;
    RETURN c;
END $$ LANGUAGE plpgsql
    SET search_path = ejercicio, public;

-- =====================================================================
-- Vistas
-- =====================================================================

-- Ejercicios SIN lo secreto (transcripción, respuestas, rúbrica): lo único
-- que llega al navegador del estudiante antes de entregar.
CREATE VIEW v_ejercicios_publicos AS
SELECT e.id, e.dia_id, e.orden, e.tipo, e.titulo, e.instruccion, e.audio_url, e.enunciado,
       CASE WHEN e.tipo = 'completar' THEN jsonb_array_length(e.respuestas) END AS espacios
FROM ejercicios e
WHERE e.activo
ORDER BY e.dia_id, e.orden;

-- Resultados por entrega (reportes y exportar CSV).
CREATE VIEW v_resultados AS
SELECT g.codigo AS generacion, g.programa, d.fecha, (d.fecha - g.fecha_inicio + 1) AS numero_dia,
       s.email, en.nombre, en.id AS entrega_id, en.estado, en.puntaje_total,
       en.started_at, en.completed_at
FROM entregas en
JOIN dias d          ON d.id = en.dia_id
JOIN generaciones g  ON g.id = d.generacion_id
JOIN estudiantes s   ON s.id = en.estudiante_id;

COMMIT;

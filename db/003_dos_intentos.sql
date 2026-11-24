-- =====================================================================
-- 003 · Dos intentos por día
--
-- Cada estudiante puede hacer cada día hasta 2 veces (todas las
-- generaciones, todos los días). Cuenta el MEJOR intento.
--   - entregas.intento (1 o 2): lo asigna validar_entrega al crearla.
--   - Un solo intento en curso por estudiante y día.
--   - El 2.º intento solo se puede empezar cuando el 1.º ya tiene su
--     resultado (listo, o 'error' si la IA no pudo escribir el feedback).
-- Si se cambia el máximo, cambiar también MAX_INTENTOS en lib/tipos.ts.
--
-- Correr ANTES de desplegar el código que la usa:
--   psql "<DATABASE_URL sin ?schema=...>" -f db/003_dos_intentos.sql
-- =====================================================================

BEGIN;
SET LOCAL search_path TO ejercicio, public;

ALTER TABLE entregas ADD COLUMN intento SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE entregas ADD CONSTRAINT entregas_intento_check CHECK (intento BETWEEN 1 AND 2);

-- Antes: UNIQUE (dia_id, estudiante_id) = una entrega por día.
ALTER TABLE entregas DROP CONSTRAINT entregas_dia_id_estudiante_id_key;
ALTER TABLE entregas ADD CONSTRAINT entregas_dia_estudiante_intento_key UNIQUE (dia_id, estudiante_id, intento);
CREATE UNIQUE INDEX entregas_un_intento_en_curso ON entregas (dia_id, estudiante_id)
    WHERE estado = 'en_progreso';

CREATE OR REPLACE FUNCTION validar_entrega() RETURNS trigger AS $$
DECLARE d dias%ROWTYPE; g generaciones%ROWTYPE; previos INT; ocupado BOOLEAN; calificando BOOLEAN;
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

    SELECT count(*), coalesce(bool_or(estado = 'en_progreso'), false),
           coalesce(bool_or(estado IN ('pendiente', 'calificando')), false)
      INTO previos, ocupado, calificando
      FROM entregas WHERE dia_id = NEW.dia_id AND estudiante_id = NEW.estudiante_id;
    IF ocupado THEN
        RAISE EXCEPTION 'Ya tienes un intento en curso de este día';
    END IF;
    IF previos >= 2 THEN
        RAISE EXCEPTION 'Ya usaste tus 2 intentos de este día';
    END IF;
    IF calificando THEN
        RAISE EXCEPTION 'Espera a que termine de calificarse tu intento anterior';
    END IF;
    NEW.intento := previos + 1;
    RETURN NEW;
END $$ LANGUAGE plpgsql
    SET search_path = ejercicio, public;

-- Resultados por entrega: ahora con el número de intento (al final: así lo
-- permite CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW v_resultados AS
SELECT g.codigo AS generacion, g.programa, d.fecha, (d.fecha - g.fecha_inicio + 1) AS numero_dia,
       s.email, en.nombre, en.id AS entrega_id, en.estado, en.puntaje_total,
       en.started_at, en.completed_at, en.intento
FROM entregas en
JOIN dias d          ON d.id = en.dia_id
JOIN generaciones g  ON g.id = d.generacion_id
JOIN estudiantes s   ON s.id = en.estudiante_id;

COMMIT;

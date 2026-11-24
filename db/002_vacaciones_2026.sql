-- =====================================================================
-- Ejercicios de vacaciones (9 dic 2026 → 4 ene 2027): crea las dos
-- generaciones con sus 27 días y copia los estudiantes (y los admins) desde
-- el schema `evaluacion` de la misma base. Correr DESPUÉS de 001_schema.sql:
--   psql "<DATABASE_URL sin ?schema=...>" -f db/002_vacaciones_2026.sql
--
-- ANTES de correrlo, confirma los códigos de las generaciones en evaluacion:
--   SELECT codigo, nombre FROM evaluacion.generaciones ORDER BY fecha_inicio;
-- y, si no son estos, cámbialos en la sección 2 (gen-2026-03 = G1, gen-2026-11 = G2).
--
-- Se puede correr otra vez: no duplica nada (sirve para traer estudiantes que
-- se agregaron después en evaluacion). Todo va en una transacción.
-- =====================================================================

BEGIN;
SET LOCAL search_path TO ejercicio, public;

-- 1. Generaciones y sus días (sin publicar: se publican desde el panel cuando
--    tengan ejercicios). Los días anteriores se pueden entregar hasta el 4 ene.
INSERT INTO generaciones (codigo, nombre, programa, fecha_inicio, fecha_fin, entrega_hasta)
VALUES ('g1-vacaciones', 'Generación 1 · Vacaciones', 'audio_largo',   '2026-12-09', '2027-01-04', '2027-01-04'),
       ('g2-vacaciones', 'Generación 2 · Vacaciones', 'audios_cortos', '2026-12-09', '2027-01-04', '2027-01-04')
ON CONFLICT (codigo) DO NOTHING;

SELECT codigo, generar_dias(id) AS dias_creados
  FROM generaciones WHERE codigo IN ('g1-vacaciones', 'g2-vacaciones');

-- 2. Estudiantes desde evaluacion (se duplica la información a propósito: cada
--    sistema tiene su propia lista). Un correo que ya esté aquí no se toca.
INSERT INTO estudiantes (generacion_id, email, activo)
SELECT (SELECT id FROM generaciones WHERE codigo = 'g1-vacaciones'), s.email, s.activo
  FROM evaluacion.estudiantes s
  JOIN evaluacion.generaciones g ON g.id = s.generacion_id
 WHERE g.codigo = 'gen-2026-03'                                   -- <<< G1 en evaluacion
   AND NOT EXISTS (SELECT 1 FROM evaluacion.staff st WHERE st.email = s.email)
ON CONFLICT (email) DO NOTHING;

INSERT INTO estudiantes (generacion_id, email, activo)
SELECT (SELECT id FROM generaciones WHERE codigo = 'g2-vacaciones'), s.email, s.activo
  FROM evaluacion.estudiantes s
  JOIN evaluacion.generaciones g ON g.id = s.generacion_id
 WHERE g.codigo = 'gen-2026-11'                                   -- <<< G2 en evaluacion
   AND NOT EXISTS (SELECT 1 FROM evaluacion.staff st WHERE st.email = s.email)
ON CONFLICT (email) DO NOTHING;

-- 3. Admins de evaluacion: entran aquí con su MISMA contraseña (se copia el
--    hash scrypt). Si prefieres crearlos aparte, borra este bloque y usa
--    `npm run crear-admin`.
INSERT INTO staff (email, nombre, rol, password_hash, activo)
SELECT email, nombre, 'admin', password_hash, activo
  FROM evaluacion.staff
 WHERE rol = 'admin' AND activo
ON CONFLICT (email) DO NOTHING;

-- Resumen
SELECT g.codigo, g.programa, count(DISTINCT d.id) AS dias, count(DISTINCT s.id) AS estudiantes
  FROM generaciones g
  LEFT JOIN dias d ON d.generacion_id = g.id
  LEFT JOIN estudiantes s ON s.generacion_id = g.id
 GROUP BY g.codigo, g.programa
 ORDER BY g.codigo;

COMMIT;

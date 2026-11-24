# sistema-ejercicios · Speak Easy

Práctica diaria de inglés por generación (vacaciones: 9 dic 2026 → 4 ene 2027). Mismo diseño, login y estructura que `sistema-evaluaciones`, en la misma base de datos pero con su propio schema: **`ejercicio`**.

- **G1** (programa `audio_largo`): cada día 1 audio largo (transcribirlo literalmente **o** completar el texto incompleto) + 1 pregunta abierta. El audio vale 70 % del día y la abierta 30 %.
- **G2** (programa `audios_cortos`): cada día 10 audios cortos para transcribir literalmente. Todos valen lo mismo.
- Cada día se desbloquea a las 12:00 a. m. (hora de Colombia); los futuros no se le muestran al estudiante. Los días anteriores se pueden hacer hasta el «último día para entregar» de la generación.
- **Dos intentos por día**: cuenta el mejor. Lo que decía cada audio y las respuestas correctas se muestran cuando termina sus intentos (o cierra el plazo).
- Calificación automática en el servidor; la IA (OpenAI) escribe una retroalimentación corta (las confusiones concretas o la felicitación) y califica la pregunta abierta: **una llamada por intento**. Sin correos.
- Paneles: **estudiante** y **admin** (el de profesores queda para después; el rol `docente` ya existe).

## Puesta en marcha

1. **Crear el schema** (una vez, sobre la misma base de evaluaciones; psql no acepta `?schema=` en la URL):
   ```bash
   psql "<DATABASE_URL sin ?schema=...>" -f db/001_schema.sql
   ```
   Comprobar: `SELECT to_regclass('ejercicio.entregas');` (no debe dar NULL).
   Luego las migraciones en orden, **antes** de desplegar el código que las usa:
   ```bash
   psql "<DATABASE_URL sin ?schema=...>" -f db/003_dos_intentos.sql
   ```

2. **(Opcional) Generaciones de vacaciones + estudiantes**: crea G1 y G2 con sus 27 días y copia los estudiantes y los admins (con su misma contraseña) desde el schema `evaluacion`. Antes, revisa los códigos de G1/G2 en evaluacion (`SELECT codigo, nombre FROM evaluacion.generaciones;`) y ajústalos en el archivo si no son `gen-2026-03` y `gen-2026-11`.
   ```bash
   psql "<DATABASE_URL sin ?schema=...>" -f db/002_vacaciones_2026.sql
   ```
   Se puede correr otra vez sin duplicar nada (trae los estudiantes nuevos).

3. **Variables** (`.env.local` en local, Vercel en producción; ver `.env.example`):
   - `DATABASE_URL=...?schema=ejercicio`
   - `SESSION_SECRET` (32+ caracteres, distinta a la de evaluaciones)
   - `OPENAI_API_KEY`, `OPENAI_MODEL` (opcional, por defecto gpt-4.1-mini)
   - `BLOB_READ_WRITE_TOKEN`: la misma que usa evaluaciones para subir audios. No se escribe a mano: en Vercel, Storage → el Blob store de evaluaciones → **Connect Project** → `sistema-ejercicios`, y Vercel la agrega sola. Los audios quedan en la carpeta `ejercicios/audios/` del store, aparte de los de evaluaciones. En local solo hace falta para probar la subida (`vercel env pull .env.local`).

4. **Admin**: si no corriste el paso 2, crea el primero con `npm run crear-admin -- --email ana@ejemplo.com --nombre "Ana Pérez"`. Los demás se crean desde **Staff** en el panel.

5. `npm install` y `npm run dev`.

## Cargar los ejercicios (panel admin)

Generaciones → la generación → un día:
- **Subir varios audios**: eliges los 10 audios del día (quedan en el orden de sus nombres), escribes la transcripción de cada uno y se agregan de una vez (G2).
- **+ Agregar ejercicio**: transcripción (audio + lo que dice), completar el texto (audio + el texto con las palabras que faltan entre `[corchetes]`, variantes con `|`: `I [usually|normally] wake up at [seven|7].`) o pregunta abierta (pregunta + rúbrica opcional para la IA).
- **Copiar de otro día** y reordenar / desactivar / eliminar desde el menú «⋯».
- Publica el día (o usa **Publicar días listos** en la generación): un día publicado lo ven los estudiantes desde su fecha.

**Progreso**: matriz estudiantes × días con el mejor puntaje de cada uno (clic = ver el intento; un «2» en la esquina = lo hizo dos veces), exportar CSV, «Reintentar IA» y eliminar un intento para devolvérselo al estudiante.

## Pruebas

- `npm test`: calificación (transcripción palabra por palabra, completar, pesos G1/G2) y lectura de la respuesta de la IA.
- `npx tsc --noEmit` y `npm run lint`.

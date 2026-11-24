@AGENTS.md

# sistema-ejercicios · Speak Easy

Práctica diaria de inglés por generación. Es una réplica reducida de `../sistema-evaluaciones` (mismo stack, diseño, login, patrones de BD e IA): ante la duda, mirar cómo lo hace ese proyecto. **No** modificar `../sistema-evaluaciones`.

## Negocio
- **Generación** con un **programa**: `audio_largo` (G1: 1 audio largo —transcripción o completar— + 1 pregunta abierta por día; audio 70 / abierta 30) o `audios_cortos` (G2: 10 audios cortos de transcripción por día, todos con el mismo peso). Pesos por defecto en `pesoPorDefecto()` (`lib/tipos.ts`); cada ejercicio guarda su `peso`.
- **Días**: uno por fecha entre `fecha_inicio` y `fecha_fin` (`generar_dias`). Número del día = fecha − fecha_inicio + 1 (no se guarda). El estudiante lo ve desde su fecha a las 00:00 de Bogotá (`hoy_bogota()`), si está **publicado** y tiene ejercicios activos. Los atrasados se pueden hacer hasta `entrega_hasta` (NULL = sin límite).
- **Entrega**: UNA por estudiante y día (UNIQUE). Para repetir, el admin la elimina. Estados: `en_progreso` → `pendiente` → `calificando` → `listo` (`error` al 3.er fallo de la IA). El borrador se autoguarda en `entregas.respuestas_borrador`.
- **Calificación** (`lib/ejercicios/`, puro y con tests): transcripción = 1 − (cambios + faltantes + sobrantes)/palabras del audio (alineación por palabras; no cuentan mayúsculas, puntuación, tildes, apóstrofes, contracciones negativas ni números en cifras/letras); completar = espacios correctos/espacios con `normalize()`; abierta = nota IA/10. Día = Σ nota × peso / Σ peso × 100.
- **IA** (`lib/ia/`): una sola llamada por entrega, después de responder (`after()`): califica las abiertas pendientes y escribe el feedback del día. Candado `procesando_hasta`; la pantalla de calificando y el resultado relanzan por `/api/entregas/[id]/estado`; el staff tiene «Reintentar IA». **Sin correos.**
- **Estudiantes**: solo su correo (+ activo); el nombre lo escriben al entrar y queda en cada entrega. Se duplican desde el schema `evaluacion` con `db/002_vacaciones_2026.sql`.
- **Staff**: `admin` (todo) y `docente` (reservado para el panel de profesores; hoy puede editar días/ejercicios y ver progreso).

## Stack y reglas
- Next 16 (`cacheComponents`, `proxy.ts`), TypeScript, Tailwind 4, `pg` con conexiones efímeras (`lib/db.ts`), schema **`ejercicio`** (`?schema=ejercicio`). Leer `node_modules/next/dist/docs/` antes de usar APIs de Next. Lo que lea cookies/BD en una página va en `<Suspense>`.
- Seguridad: el estudiante solo recibe `v_ejercicios_publicos` antes de entregar (nunca `transcripcion`, `respuestas` ni `rubrica`); después de entregar sí ve la transcripción y las correctas (no hay segundo intento). Calificar siempre en el servidor. Autorizar en cada route handler / server action con `requireStaff` / `requireEstudiante`. Cookie propia `se_ejercicios`.
- Las reglas de forma viven en la BD (`validar_ejercicio`, `validar_entrega`); la app solo traduce sus errores (`lib/db-errores.ts`). Las funciones del schema fijan `search_path = ejercicio, public` porque `evaluacion` tiene tablas con los mismos nombres.
- Diseño: el de evaluaciones (tokens en `app/globals.css`, componentes en `app/components/ui/`). Mobile first.
- Zona horaria del negocio: America/Bogota. Validación con zod. Código y textos en español.
- Migraciones nuevas: `db/0NN_*.sql`, cada una fija su `search_path`; se corren a mano antes de desplegar el código que las usa.

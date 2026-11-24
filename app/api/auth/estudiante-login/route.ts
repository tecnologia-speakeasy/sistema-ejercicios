import { z } from "zod";
import { query } from "@/lib/db";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema, nombreSchema } from "@/lib/validacion";
import { setSession } from "@/lib/auth/session";

// Paso 2 del login de un estudiante: correo autorizado + el nombre que escribe
// → sesión. El nombre va en la sesión y se copia a cada entrega.
//   { ok: true } · 403 { error }

const schema = z.object({ email: emailSchema, nombre: nombreSchema });

const NO_AUTORIZADO =
  "Este correo no está autorizado. Si crees que es un error, escribe a tu coordinador académico.";

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  const { email, nombre } = entrada.data;

  try {
    const { rows } = await query<{ id: number }>(`SELECT id FROM estudiantes WHERE email = $1 AND activo`, [email]);
    if (!rows[0]) return Response.json({ error: NO_AUTORIZADO }, { status: 403 });
    await setSession({ tipo: "estudiante", id: rows[0].id, nombre });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[auth/estudiante-login]", e);
    return errorServidor();
  }
}

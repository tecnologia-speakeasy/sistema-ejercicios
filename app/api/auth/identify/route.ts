import { z } from "zod";
import { query } from "@/lib/db";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema } from "@/lib/validacion";

// Paso 1 del login unificado: ¿de quién es este correo?
//   { tipo: "staff" }        → el formulario pide la contraseña
//   { tipo: "estudiante" }   → pide el nombre (/api/auth/estudiante-login)
//   { tipo: "no_autorizado" }

const schema = z.object({ email: emailSchema });

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  const { email } = entrada.data;

  try {
    const { rows } = await query<{ tipo: "staff" | "estudiante" }>(
      `SELECT 'staff' AS tipo FROM staff WHERE email = $1 AND activo
       UNION ALL
       SELECT 'estudiante' FROM estudiantes WHERE email = $1 AND activo`,
      [email],
    );
    // Si un correo está en ambas tablas, gana staff.
    if (rows.some((r) => r.tipo === "staff")) return Response.json({ tipo: "staff" });
    if (rows.some((r) => r.tipo === "estudiante")) return Response.json({ tipo: "estudiante" });
    return Response.json({ tipo: "no_autorizado" });
  } catch (e) {
    console.error("[auth/identify]", e);
    return errorServidor();
  }
}

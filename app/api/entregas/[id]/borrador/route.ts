import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { guardarBorrador } from "@/lib/datos/entregas";
import { respuestasSchema } from "@/lib/ejercicios/respuestas";
import { errorServidor, leerJson } from "@/lib/http";
import { idUrlSchema } from "@/lib/validacion";

// Guardado automático mientras practica (también con keepalive al cerrar la pestaña).
//   { ok: true }
//   409 { motivo: "fuera_de_plazo" | "enviado" } → el navegador entrega / va al resultado

const schema = z.object({ respuestas: respuestasSchema });

export async function PUT(req: Request, ctx: RouteContext<"/api/entregas/[id]/borrador">) {
  const id = idUrlSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Entrega inválida." }, { status: 404 });
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;

  try {
    const estudiante = await requireEstudiante();
    const r = await guardarBorrador(id.data, estudiante.id, entrada.data.respuestas);
    if (r.ok) return Response.json({ ok: true });
    if (r.motivo === "no_existe") return Response.json({ error: "Entrega no encontrada." }, { status: 404 });
    if (r.motivo === "generacion_inactiva") {
      return Response.json({ error: "Tu generación está desactivada por ahora." }, { status: 403 });
    }
    return Response.json(
      {
        motivo: r.motivo,
        error:
          r.motivo === "fuera_de_plazo"
            ? "Terminó el plazo para entregar: calificamos lo que quedó guardado."
            : "Este día ya se entregó.",
      },
      { status: 409 },
    );
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[entregas/borrador]", e);
    return errorServidor();
  }
}

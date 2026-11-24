import { after } from "next/server";
import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { enviarEntrega } from "@/lib/datos/entregas";
import { respuestasSchema } from "@/lib/ejercicios/respuestas";
import { ErrorNegocio } from "@/lib/errores";
import { errorServidor, leerJson } from "@/lib/http";
import { procesarEntrega } from "@/lib/ia/procesar";
import { idUrlSchema } from "@/lib/validacion";

// "Entregar": califica en el servidor y responde de una vez; la IA (feedback y
// abiertas) corre después de responder (after()). La pantalla espera con ./estado.
//   { estado, fecha }

// La IA tarda 10–30 s (más con reintentos): after() necesita ese margen.
export const maxDuration = 300;

const schema = z.object({ respuestas: respuestasSchema });

export async function POST(req: Request, ctx: RouteContext<"/api/entregas/[id]/enviar">) {
  const id = idUrlSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Entrega inválida." }, { status: 404 });
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;

  try {
    const estudiante = await requireEstudiante();
    const r = await enviarEntrega(id.data, estudiante.id, entrada.data.respuestas);
    if (!r) return Response.json({ error: "Entrega no encontrada." }, { status: 404 });
    if (r.estado === "pendiente") {
      after(async () => {
        await procesarEntrega(id.data).catch((e) => console.error("[entregas/enviar] IA", e));
      });
    }
    return Response.json(r);
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    if (e instanceof ErrorNegocio) return Response.json({ error: e.message }, { status: 409 });
    console.error("[entregas/enviar]", e);
    return errorServidor();
  }
}

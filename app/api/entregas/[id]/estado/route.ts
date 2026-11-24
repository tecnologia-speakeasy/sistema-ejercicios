import { after } from "next/server";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { estadoEntrega } from "@/lib/datos/entregas";
import { errorServidor } from "@/lib/http";
import { procesarEntrega } from "@/lib/ia/procesar";
import { idUrlSchema } from "@/lib/validacion";

// La consulta la pantalla de "calificando" (y el resultado pendiente) cada
// pocos segundos. Si la entrega quedó pendiente y nadie la está procesando
// (falló, o se cortó el after() del envío), vuelve a lanzar la IA; el candado
// evita llamadas dobles.
//   { estado, fecha, puntaje }

export const maxDuration = 300;

export async function GET(_req: Request, ctx: RouteContext<"/api/entregas/[id]/estado">) {
  const id = idUrlSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Entrega inválida." }, { status: 404 });

  try {
    const estudiante = await requireEstudiante();
    const r = await estadoEntrega(id.data, estudiante.id);
    if (!r) return Response.json({ error: "Entrega no encontrada." }, { status: 404 });
    if (r.relanzar) {
      after(async () => {
        await procesarEntrega(id.data).catch((e) => console.error("[entregas/estado] IA", e));
      });
    }
    return Response.json(
      { estado: r.estado, fecha: r.fecha, puntaje: r.puntaje },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[entregas/estado]", e);
    return errorServidor();
  }
}

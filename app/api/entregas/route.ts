import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { iniciarOReanudar } from "@/lib/datos/entregas";
import { ErrorNegocio } from "@/lib/errores";
import { errorServidor, leerJson } from "@/lib/http";
import { idSchema } from "@/lib/validacion";

// "Comenzar" / "Continuar" un día: retoma la entrega en curso o la crea.
//   { tipo: "en_curso", entrega: { id, borrador } }
//   { tipo: "finalizado" }   → ya la entregó
//   409 { error }            → bloqueado, sin publicar, plazo vencido…

const schema = z.object({ diaId: idSchema });

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  try {
    const estudiante = await requireEstudiante();
    return Response.json(await iniciarOReanudar(entrada.data.diaId, estudiante));
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    if (e instanceof ErrorNegocio) return Response.json({ error: e.message }, { status: 409 });
    console.error("[entregas/iniciar]", e);
    return errorServidor();
  }
}

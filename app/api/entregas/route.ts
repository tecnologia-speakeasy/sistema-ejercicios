import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { iniciarOReanudar } from "@/lib/datos/entregas";
import { ErrorNegocio } from "@/lib/errores";
import { errorServidor, leerJson } from "@/lib/http";
import { MAX_INTENTOS } from "@/lib/tipos";
import { idSchema } from "@/lib/validacion";

// "Comenzar" / "Continuar" un día: retoma el intento en curso o crea el intento
// pedido (1 o 2).
//   { tipo: "en_curso", entrega: { id, intento, borrador } }
//   { tipo: "finalizado" }   → ese intento ya lo entregó
//   409 { error }            → bloqueado, sin publicar, plazo vencido, sin intentos…

const schema = z.object({ diaId: idSchema, intento: z.number().int().min(1).max(MAX_INTENTOS) });

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  try {
    const estudiante = await requireEstudiante();
    return Response.json(await iniciarOReanudar(entrada.data.diaId, entrada.data.intento, estudiante));
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    if (e instanceof ErrorNegocio) return Response.json({ error: e.message }, { status: 409 });
    console.error("[entregas/iniciar]", e);
    return errorServidor();
  }
}

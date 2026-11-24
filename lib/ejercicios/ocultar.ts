import type { TipoEjercicio } from "@/lib/tipos";
import type { Detalle } from "./calificar";
import type { DetalleTranscripcion, Operacion } from "./transcripcion";

// Mientras le queden intentos, el estudiante no ve lo que decía el audio ni las
// respuestas correctas (como en evaluaciones): se quitan aquí, en el servidor,
// antes de pintar la revisión. Ve lo que escribió marcado: qué palabras estaban
// mal y dónde le faltó una, sin la palabra correcta.

type ConCorrectas = {
  tipo: TipoEjercicio;
  transcripcion: string | null;
  correctas: string[][] | null;
  detalle: Detalle;
};

const sinPalabraCorrecta = (o: Operacion): Operacion =>
  o.t === "cambio" ? { ...o, p: "" } : o.t === "falta" ? { ...o, p: "" } : o;

export function sinCorrectas<T extends ConCorrectas>(r: T): T {
  const oculto = { ...r, transcripcion: null, correctas: null };
  if (r.tipo !== "transcripcion" || !r.detalle) return oculto;
  const d = r.detalle as DetalleTranscripcion;
  return { ...oculto, detalle: { ...d, ops: d.ops.map(sinPalabraCorrecta) } };
}

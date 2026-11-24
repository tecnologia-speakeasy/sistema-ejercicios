import { unstable_rethrow } from "next/navigation";
import { ErrorAutorizacion, requireStaff } from "@/lib/auth/guards";
import { celdaCsv } from "@/lib/csv-exportar";
import { obtenerGeneracion } from "@/lib/datos/generaciones";
import { filasExportar } from "@/lib/datos/progreso";
import { errorServidor } from "@/lib/http";
import { idUrlSchema } from "@/lib/validacion";

// CSV del progreso de una generación: una fila por estudiante con su puntaje de
// cada día. Separador ";", UTF-8 con BOM y CRLF para que Excel en español lo
// abra en columnas y con tildes.
export async function GET(req: Request) {
  try {
    await requireStaff();
    const id = idUrlSchema.safeParse(new URL(req.url).searchParams.get("generacion"));
    if (!id.success) return Response.json({ error: "Generación inválida." }, { status: 400 });
    const generacion = await obtenerGeneracion(id.data);
    if (!generacion) return Response.json({ error: "La generación no existe." }, { status: 404 });

    const { columnas, filas } = await filasExportar(id.data);
    const encabezado = ["correo", "nombre", "activo", "dias_entregados", "promedio", ...columnas.map((c) => `dia_${c.numero} (${c.fecha})`)];
    const lineas = [
      encabezado,
      ...filas.map((f) => [
        f.email,
        f.nombre ?? "",
        f.activo ? "sí" : "no",
        String(f.completados),
        f.promedio === null ? "" : String(f.promedio),
        ...columnas.map((c) => {
          const celda = f.celdas[c.fecha];
          if (!celda) return "";
          if (celda.estado === "en_progreso") return "en curso";
          return celda.puntaje === null ? "calificando" : String(celda.puntaje);
        }),
      ]),
    ].map((fila) => fila.map(celdaCsv).join(";"));

    return new Response(`﻿${lineas.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="progreso-${generacion.codigo}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // Deja pasar lo interno de Next (p. ej. al prerenderizar en el build).
    unstable_rethrow(e);
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[progreso/exportar]", e);
    return errorServidor();
  }
}

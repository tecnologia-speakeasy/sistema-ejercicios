"use client";

import { useState, useTransition } from "react";
import { eliminarEntregaAction } from "@/app/admin/acciones/entregas";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";

// Eliminar la entrega (solo admin, irreversible) para que el estudiante pueda
// repetir el día.
export default function EliminarEntrega({ entregaId, quien, dia }: { entregaId: number; quien: string; dia: number }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <>
      <Boton variante="peligro" onClick={() => setAbierto(true)}>
        Eliminar entrega
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="¿Eliminar la entrega?">
        <div className="flex flex-col gap-4 text-[15px]">
          <Aviso tono="error">
            <strong>No se puede deshacer.</strong> Se borran las respuestas, el puntaje y el feedback del día {dia} de{" "}
            {quien}.
          </Aviso>
          <p>El estudiante podrá volver a hacer ese día mientras siga disponible (hasta el último día para entregar).</p>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  setError(null);
                  const r = await eliminarEntregaAction(entregaId);
                  if (r && !r.ok) setError(r.error);
                })
              }
            >
              {pendiente ? "Eliminando…" : "Eliminar"}
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}

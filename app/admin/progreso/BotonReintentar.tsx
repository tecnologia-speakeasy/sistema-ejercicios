"use client";

import { useState, useTransition } from "react";
import { reintentarIAAction } from "@/app/admin/acciones/entregas";
import { Boton } from "@/app/components/ui/Boton";

export default function BotonReintentar({ entregaId }: { entregaId: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Boton
        variante="secundario"
        tamano="sm"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            const r = await reintentarIAAction(entregaId);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pendiente ? "La IA está trabajando…" : "Reintentar IA"}
      </Boton>
      {error && (
        <p role="alert" className="max-w-[260px] text-right text-xs text-error-texto">
          {error}
        </p>
      )}
    </div>
  );
}

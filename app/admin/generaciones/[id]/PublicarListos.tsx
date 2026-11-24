"use client";

import { useState, useTransition } from "react";
import { publicarListosAction } from "@/app/admin/acciones/generaciones";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";

// Publica de una vez los días que ya tienen ejercicios. Publicado no es lo mismo
// que visible: cada día lo ven los estudiantes desde su fecha.
export default function PublicarListos({ generacionId, listos }: { generacionId: number; listos: number }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function publicar() {
    setError(null);
    iniciar(async () => {
      const r = await publicarListosAction(generacionId);
      if (r.ok) setAbierto(false);
      else setError(r.error);
    });
  }

  return (
    <>
      <Boton onClick={() => setAbierto(true)} disabled={listos === 0}>
        Publicar días listos{listos > 0 ? ` (${listos})` : ""}
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="¿Publicar los días listos?">
        <div className="flex flex-col gap-4 text-[15px] text-tinta">
          <p>
            Se publican {listos === 1 ? "el día que ya tiene" : `los ${listos} días que ya tienen`} ejercicios y aún no
            están publicados. Cada uno lo verán los estudiantes <strong>desde su fecha</strong> (12:00 a. m., hora de
            Colombia); los días que ya pasaron quedan disponibles de inmediato.
          </p>
          {error && (
            <p role="alert" className="text-[13px] text-error-texto">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton disabled={pendiente} onClick={publicar}>
              {pendiente ? "Publicando…" : "Publicar"}
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}

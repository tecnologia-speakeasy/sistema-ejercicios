"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// En el resultado de una entrega que la IA todavía no termina: consulta el
// estado (que además vuelve a lanzar la IA si quedó parada) y recarga los
// datos de la página cuando queda listo.
const CADA_MS = 5000;

export function EsperarResultado({ entregaId }: { entregaId: number }) {
  const router = useRouter();
  useEffect(() => {
    let vivo = true;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/entregas/${entregaId}/estado`, { cache: "no-store" });
        if (vivo && res.ok && (await res.json())?.estado === "listo") {
          clearInterval(t);
          router.refresh();
        }
      } catch {
        // Sin conexión: se vuelve a intentar.
      }
    }, CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [entregaId, router]);
  return null;
}

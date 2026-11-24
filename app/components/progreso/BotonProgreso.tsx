"use client";

import Link from "next/link";
import { useState } from "react";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { formatearFecha } from "@/lib/fechas";
import { GraficoProgreso, type PuntoProgreso } from "./GraficoProgreso";

// "Mi progreso" del inicio: pop-up con la gráfica de su puntaje por día y la
// lista de los días que ya entregó (cada uno lleva a su resultado).
export function BotonProgreso({ dias }: { dias: PuntoProgreso[] }) {
  const [abierto, setAbierto] = useState(false);
  const hechos = dias.filter((d) => d.puntaje !== null);
  const puntajes = hechos.map((d) => d.puntaje!);
  const promedio = puntajes.length ? Math.round(puntajes.reduce((s, p) => s + p, 0) / puntajes.length) : null;

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Mi progreso
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} etiqueta="Mi progreso" ancho="max-w-4xl">
        <Tarjeta as="section" aria-labelledby="titulo-progreso">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="titulo-progreso" className="text-lg font-extrabold text-titulo">
              Mi progreso por día
            </h2>
            {promedio !== null && (
              <p className="text-sm text-gris-oscuro">
                {hechos.length} {hechos.length === 1 ? "día" : "días"} · Promedio{" "}
                <strong className="text-tinta">{promedio}/100</strong> · Mejor{" "}
                <strong className="text-tinta">{Math.max(...puntajes)}/100</strong>
              </p>
            )}
          </div>
          {/* En celular la gráfica se desliza a los lados. */}
          <div className="overflow-x-auto">
            <GraficoProgreso dias={dias} />
          </div>
        </Tarjeta>
        {hechos.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[...hechos].reverse().map((d) => (
              <li key={d.fecha}>
                <Link
                  href={`/dia/${d.fecha}/resultado`}
                  className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-borde bg-white px-4 py-2.5 hover:border-rosa"
                >
                  <span className="text-sm text-tinta">
                    <strong>Día {d.numero}</strong> · {formatearFecha(d.fecha)}
                  </span>
                  <span className="text-[17px] font-extrabold text-tinta">
                    {d.puntaje}
                    <span className="text-sm font-bold text-rosa-hover">/100</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Dialogo>
    </>
  );
}

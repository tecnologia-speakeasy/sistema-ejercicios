"use client";

import { useState, useTransition, type FormEvent } from "react";
import { crearGeneracionAction } from "@/app/admin/acciones/generaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { PROGRAMAS, PROGRAMAS_LISTA, type Programa } from "@/lib/tipos";

// Crea la generación con un día por fecha (sin publicar) y abre su calendario.
export default function CrearGeneracion() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>+ Crear generación</Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Crear generación">
        <Formulario />
      </Dialogo>
    </>
  );
}

function Formulario() {
  const [datos, setDatos] = useState({
    codigo: "",
    nombre: "",
    programa: "audio_largo" as Programa,
    fecha_inicio: "2026-12-09",
    fecha_fin: "2027-01-04",
    entrega_hasta: "2027-01-04",
  });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const errorDe = (c: string) => (error?.campo === c ? error.mensaje : null);
  const cambiar = (c: keyof typeof datos, v: string) => {
    setDatos((d) => ({ ...d, [c]: v }));
    setError(null);
  };
  const dias =
    datos.fecha_inicio && datos.fecha_fin && datos.fecha_fin >= datos.fecha_inicio
      ? Math.round((Date.parse(datos.fecha_fin) - Date.parse(datos.fecha_inicio)) / 86_400_000) + 1
      : null;

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      // Si sale bien, la action redirige a la nueva generación.
      const r = await crearGeneracionAction(datos);
      if (r && !r.ok) setError({ mensaje: r.error, campo: r.campo });
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Programa" error={errorDe("programa")}>
        <div role="radiogroup" aria-label="Programa" className="grid gap-2">
          {PROGRAMAS_LISTA.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={datos.programa === p}
              onClick={() => cambiar("programa", p)}
              className={`cursor-pointer rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors ${
                datos.programa === p ? "border-rosa bg-rosa/5" : "border-borde bg-white hover:border-rosa/50"
              }`}
            >
              <span className="block text-sm font-bold text-tinta">
                {p === "audio_largo" ? "G1 · " : "G2 · "}
                {PROGRAMAS[p].etiqueta}
              </span>
              <span className="block text-[13px] text-gris-oscuro">{PROGRAMAS[p].descripcion}</span>
            </button>
          ))}
        </div>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" htmlFor="gen-nombre" error={errorDe("nombre")}>
          <Entrada
            id="gen-nombre"
            value={datos.nombre}
            placeholder="Generación 1 · Vacaciones"
            onChange={(e) => cambiar("nombre", e.target.value)}
            invalida={!!errorDe("nombre")}
          />
        </Campo>
        <Campo etiqueta="Código" htmlFor="gen-codigo" error={errorDe("codigo")} ayuda="Minúsculas y guiones. No cambia.">
          <Entrada
            id="gen-codigo"
            value={datos.codigo}
            placeholder="g1-vacaciones"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => cambiar("codigo", e.target.value.toLowerCase())}
            invalida={!!errorDe("codigo")}
          />
        </Campo>
        <Campo etiqueta="Primer día" htmlFor="gen-inicio" error={errorDe("fecha_inicio")}>
          <Entrada
            id="gen-inicio"
            type="date"
            value={datos.fecha_inicio}
            onChange={(e) => cambiar("fecha_inicio", e.target.value)}
            invalida={!!errorDe("fecha_inicio")}
          />
        </Campo>
        <Campo etiqueta="Último día" htmlFor="gen-fin" error={errorDe("fecha_fin")}>
          <Entrada
            id="gen-fin"
            type="date"
            value={datos.fecha_fin}
            onChange={(e) => cambiar("fecha_fin", e.target.value)}
            invalida={!!errorDe("fecha_fin")}
          />
        </Campo>
      </div>
      <Campo
        etiqueta="Último día para entregar"
        htmlFor="gen-entrega"
        error={errorDe("entrega_hasta")}
        ayuda="Hasta ese día pueden ponerse al día con los días anteriores. Vacío = sin límite."
      >
        <Entrada
          id="gen-entrega"
          type="date"
          value={datos.entrega_hasta}
          onChange={(e) => cambiar("entrega_hasta", e.target.value)}
          invalida={!!errorDe("entrega_hasta")}
        />
      </Campo>

      {error && !error.campo && <Aviso tono="error">{error.mensaje}</Aviso>}

      <p className="text-sm text-gris-oscuro">
        {dias ? `Se crearán ${dias} días` : "Se creará un día por fecha"} sin publicar y sin ejercicios. Cada día se
        desbloquea para los estudiantes a las 12:00 a. m. (hora de Colombia) de su fecha.
      </p>
      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? "Creando…" : "Crear generación"}
      </Boton>
    </form>
  );
}

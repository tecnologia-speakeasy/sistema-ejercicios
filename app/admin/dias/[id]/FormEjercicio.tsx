"use client";

import { Fragment, useState, useTransition, type FormEvent } from "react";
import { guardarEjercicioAction } from "@/app/admin/acciones/ejercicios";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/app/components/ui/Campo";
import type { EjercicioStaff } from "@/lib/datos/ejercicios";
import { armarMarcado, leerMarcado, partirEnunciado } from "@/lib/ejercicios/completar";
import type { EntradaEjercicio } from "@/lib/ejercicios/entrada";
import { ETIQUETA_TIPO, INSTRUCCION_POR_TIPO, pesoPorDefecto, PROGRAMAS, type Programa, type TipoEjercicio } from "@/lib/tipos";
import { CampoAudio } from "./CampoAudio";

// Crear o editar un ejercicio. Los tipos que se ofrecen dependen del programa
// de la generación (G2: solo transcripción).

type Estado = {
  tipo: TipoEjercicio;
  titulo: string;
  instruccion: string;
  audio_url: string;
  transcripcion: string;
  texto: string;
  enunciado: string;
  rubrica: string;
  peso: string;
};

const CAMPOS = ["tipo", "titulo", "instruccion", "audio_url", "transcripcion", "texto", "enunciado", "rubrica", "peso"];

const AYUDA_TIPO: Record<TipoEjercicio, string> = {
  transcripcion: "Escuchan el audio y escriben literalmente lo que dice.",
  completar: "Escuchan el audio y completan las palabras que faltan en el texto.",
  abierta: "Responden por escrito; la IA la califica de 0 a 10.",
};

export default function FormEjercicio({
  diaId,
  programa,
  ejercicio,
  subidaAudios,
  onListo,
  onCancelar,
}: {
  diaId: number;
  programa: Programa;
  /** null = nuevo. */
  ejercicio: EjercicioStaff | null;
  subidaAudios: boolean;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const tipos = PROGRAMAS[programa].tipos;
  const [e, setE] = useState<Estado>(() => {
    const tipo = ejercicio?.tipo ?? tipos[0];
    return {
      tipo,
      titulo: ejercicio?.titulo ?? "",
      instruccion: ejercicio?.instruccion ?? "",
      audio_url: ejercicio?.audio_url ?? "",
      transcripcion: ejercicio?.transcripcion ?? "",
      texto:
        ejercicio?.tipo === "completar" && ejercicio.enunciado && ejercicio.respuestas
          ? armarMarcado(ejercicio.enunciado, ejercicio.respuestas)
          : "",
      enunciado: ejercicio?.tipo === "abierta" ? (ejercicio.enunciado ?? "") : "",
      rubrica: ejercicio?.rubrica ?? "",
      peso: String(ejercicio?.peso ?? pesoPorDefecto(programa, tipo)),
    };
  });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const conRespuestas = (ejercicio?.respuestas_estudiantes ?? 0) > 0;

  const cambiar = (parcial: Partial<Estado>) => {
    setE((x) => ({ ...x, ...parcial }));
    setError(null);
  };
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : null);
  const errorGeneral = error && (!error.campo || !CAMPOS.includes(error.campo)) ? error.mensaje : null;

  function elegirTipo(tipo: TipoEjercicio) {
    // El peso por defecto sigue al tipo si no lo habían cambiado.
    const pesoActual = Number(e.peso);
    const sigue = pesoActual === pesoPorDefecto(programa, e.tipo);
    cambiar({ tipo, peso: sigue ? String(pesoPorDefecto(programa, tipo)) : e.peso });
  }

  function entrada(): EntradaEjercicio {
    const comunes = { titulo: e.titulo, instruccion: e.instruccion, peso: e.peso, audio_url: e.audio_url };
    if (e.tipo === "transcripcion") return { tipo: "transcripcion", ...comunes, transcripcion: e.transcripcion };
    if (e.tipo === "completar") return { tipo: "completar", ...comunes, texto: e.texto };
    return { tipo: "abierta", ...comunes, enunciado: e.enunciado, rubrica: e.rubrica };
  }

  function guardar(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarEjercicioAction(diaId, ejercicio?.id ?? null, entrada());
      if (!r.ok) {
        setError({ mensaje: r.error, campo: r.campo });
        return;
      }
      onListo();
    });
  }

  const marcado = e.tipo === "completar" && e.texto.trim() ? leerMarcado(e.texto) : null;

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-5">
      {conRespuestas && (
        <Aviso>
          Ya tiene {ejercicio!.respuestas_estudiantes} {ejercicio!.respuestas_estudiantes === 1 ? "respuesta" : "respuestas"} de
          estudiantes: los puntajes ya dados no cambian; los cambios aplican a quienes lo hagan de aquí en adelante.
        </Aviso>
      )}

      {tipos.length > 1 && (
        <Campo etiqueta="Tipo" error={errorDe("tipo")}>
          <div role="radiogroup" aria-label="Tipo" className="grid gap-2 sm:grid-cols-3">
            {tipos.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={e.tipo === t}
                disabled={conRespuestas && ejercicio?.tipo !== t}
                onClick={() => elegirTipo(t)}
                className={`cursor-pointer rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  e.tipo === t ? "border-rosa bg-rosa/5" : "border-borde bg-white hover:border-rosa/50"
                }`}
              >
                <span className="block text-sm font-bold text-tinta">{ETIQUETA_TIPO[t]}</span>
                <span className="block text-xs leading-snug text-gris-oscuro">{AYUDA_TIPO[t]}</span>
              </button>
            ))}
          </div>
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Campo etiqueta="Título (opcional)" htmlFor="ej-titulo" error={errorDe("titulo")}>
          <Entrada
            id="ej-titulo"
            value={e.titulo}
            placeholder={e.tipo === "abierta" ? "Pregunta abierta" : "Audio 1"}
            onChange={(x) => cambiar({ titulo: x.target.value })}
          />
        </Campo>
        <Campo etiqueta="Peso" htmlFor="ej-peso" error={errorDe("peso")} ayuda="En el puntaje del día.">
          <Entrada
            id="ej-peso"
            type="number"
            inputMode="decimal"
            min={1}
            value={e.peso}
            onChange={(x) => cambiar({ peso: x.target.value })}
            invalida={!!errorDe("peso")}
          />
        </Campo>
      </div>

      <CampoAudio
        valor={e.audio_url}
        onCambio={(audio_url) => cambiar({ audio_url })}
        subidaAudios={subidaAudios}
        error={errorDe("audio_url")}
        opcional={e.tipo !== "transcripcion"}
      />

      {e.tipo === "transcripcion" && (
        <Campo
          etiqueta="Lo que dice el audio"
          htmlFor="ej-transcripcion"
          error={errorDe("transcripcion")}
          ayuda="Con esto se califica, palabra por palabra. No cuentan mayúsculas, puntuación, tildes ni escribir los números en cifras o letras. El estudiante lo ve solo después de entregar."
        >
          <AreaTexto
            id="ej-transcripcion"
            rows={5}
            value={e.transcripcion}
            onChange={(x) => cambiar({ transcripcion: x.target.value })}
            invalida={!!errorDe("transcripcion")}
          />
        </Campo>
      )}

      {e.tipo === "completar" && (
        <Campo
          etiqueta="Texto"
          htmlFor="ej-texto"
          error={errorDe("texto")}
          ayuda={
            <>
              Escribe el texto completo y pon entre <strong>[corchetes]</strong> cada palabra que el estudiante debe
              completar. Si se acepta más de una forma, sepáralas con <strong>|</strong>: <em>I [usually|normally] wake up at [seven|7].</em>
            </>
          }
        >
          <AreaTexto
            id="ej-texto"
            rows={7}
            value={e.texto}
            onChange={(x) => cambiar({ texto: x.target.value })}
            invalida={!!errorDe("texto")}
          />
          {marcado && (
            <div className="mt-2 rounded-[10px] border border-borde-suave bg-campo px-3.5 py-3 text-sm leading-[1.9]">
              {marcado.ok ? (
                <>
                  <p className="mb-1 text-xs font-bold tracking-wide text-gris uppercase">
                    Así lo verá el estudiante · {marcado.respuestas.length}{" "}
                    {marcado.respuestas.length === 1 ? "espacio" : "espacios"}
                  </p>
                  <p className="whitespace-pre-line text-tinta">
                    {partirEnunciado(marcado.enunciado).map((seg, i, arr) => (
                      <Fragment key={i}>
                        {seg}
                        {i < arr.length - 1 && (
                          <span className="mx-0.5 inline-block min-w-[70px] border-b-2 border-tinta text-center text-xs text-gris">
                            {i + 1}
                          </span>
                        )}
                      </Fragment>
                    ))}
                  </p>
                </>
              ) : (
                <p className="text-error-texto">{marcado.error}</p>
              )}
            </div>
          )}
        </Campo>
      )}

      {e.tipo === "abierta" && (
        <>
          <Campo etiqueta="Pregunta" htmlFor="ej-enunciado" error={errorDe("enunciado")}>
            <AreaTexto
              id="ej-enunciado"
              rows={3}
              value={e.enunciado}
              placeholder="What did you do last weekend? Write at least 5 sentences."
              onChange={(x) => cambiar({ enunciado: x.target.value })}
              invalida={!!errorDe("enunciado")}
            />
          </Campo>
          <Campo
            etiqueta="Rúbrica para la IA (opcional)"
            htmlFor="ej-rubrica"
            error={errorDe("rubrica")}
            ayuda="Qué debe tener una buena respuesta (tiempo verbal, extensión, vocabulario…). Vacía: gramática, vocabulario, coherencia y que responda la pregunta."
          >
            <AreaTexto id="ej-rubrica" rows={3} value={e.rubrica} onChange={(x) => cambiar({ rubrica: x.target.value })} />
          </Campo>
        </>
      )}

      <Campo
        etiqueta="Instrucción (opcional)"
        htmlFor="ej-instruccion"
        error={errorDe("instruccion")}
        ayuda={`Vacía: «${INSTRUCCION_POR_TIPO[e.tipo]}»`}
      >
        <Entrada id="ej-instruccion" value={e.instruccion} onChange={(x) => cambiar({ instruccion: x.target.value })} />
      </Campo>

      {errorGeneral && <Aviso tono="error">{errorGeneral}</Aviso>}

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : ejercicio ? "Guardar cambios" : "Agregar ejercicio"}
        </Boton>
      </div>
    </form>
  );
}

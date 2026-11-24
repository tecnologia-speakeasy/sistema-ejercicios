"use client";

import { useState, useTransition } from "react";
import {
  cambiarActivoEjercicioAction,
  cambiarPublicadoDiaAction,
  copiarEjerciciosAction,
  eliminarEjercicioAction,
  moverEjercicioAction,
  tituloDiaAction,
} from "@/app/admin/acciones/ejercicios";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Interruptor } from "@/app/components/ui/Interruptor";
import { Menu } from "@/app/components/ui/Menu";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { ResultadoAccion } from "@/lib/acciones";
import type { EjercicioStaff } from "@/lib/datos/ejercicios";
import { partirEnunciado } from "@/lib/ejercicios/completar";
import { ETIQUETA_TIPO, PROGRAMAS, type Programa } from "@/lib/tipos";
import FormEjercicio from "./FormEjercicio";
import SubirVariosAudios from "./SubirVariosAudios";

export type DiaParaCopiar = { id: number; etiqueta: string };

// Editor de un día: título, publicar, y sus ejercicios (agregar, varios audios
// de una vez, copiar de otro día, editar, ordenar, desactivar, eliminar).
export default function EditorDia({
  diaId,
  titulo,
  publicado,
  desbloqueado,
  programa,
  ejercicios,
  subidaAudios,
  diasParaCopiar,
}: {
  diaId: number;
  titulo: string | null;
  publicado: boolean;
  desbloqueado: boolean;
  programa: Programa;
  ejercicios: EjercicioStaff[];
  subidaAudios: boolean;
  diasParaCopiar: DiaParaCopiar[];
}) {
  const [dialogo, setDialogo] = useState<
    { tipo: "nuevo" } | { tipo: "editar"; ejercicio: EjercicioStaff } | { tipo: "varios" } | { tipo: "copiar" } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cerrar = () => setDialogo(null);

  const correr = (fn: () => Promise<ResultadoAccion>) => {
    setError(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
    });
  };

  const activos = ejercicios.filter((e) => e.activo);
  const pesoTotal = activos.reduce((s, e) => s + e.peso, 0);
  const info = PROGRAMAS[programa];
  const soloTranscripcion = info.tipos.length === 1;

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <TituloDia diaId={diaId} inicial={titulo} />
        <Tarjeta relleno="px-5 py-4" className="flex items-center justify-between gap-4 md:min-w-[290px]">
          <div>
            <p className="text-sm font-bold text-tinta">{publicado ? "Publicado" : "Sin publicar"}</p>
            <p className="text-[13px] text-gris-oscuro">
              {publicado
                ? desbloqueado
                  ? "Los estudiantes ya lo ven."
                  : "Lo verán desde su fecha."
                : "Los estudiantes no lo ven."}
            </p>
          </div>
          <Interruptor
            activo={publicado}
            deshabilitado={pendiente}
            etiqueta={publicado ? "Despublicar el día" : "Publicar el día"}
            onCambio={(v) => correr(() => cambiarPublicadoDiaAction(diaId, v))}
          />
        </Tarjeta>
      </div>

      {error && (
        <Aviso tono="error" className="mb-4">
          {error}
        </Aviso>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-tinta">
            Ejercicios <span className="font-semibold text-gris">({activos.length})</span>
          </h2>
          <p className="text-[13px] text-gris-oscuro">
            {info.descripcion}
            {activos.length < info.esperados && ` Faltan ${info.esperados - activos.length}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {diasParaCopiar.length > 0 && (
            <Boton variante="secundario" onClick={() => setDialogo({ tipo: "copiar" })}>
              Copiar de otro día
            </Boton>
          )}
          <Boton variante="secundario" onClick={() => setDialogo({ tipo: "varios" })}>
            Subir varios audios
          </Boton>
          <Boton onClick={() => setDialogo({ tipo: "nuevo" })}>+ Agregar ejercicio</Boton>
        </div>
      </div>

      {ejercicios.length === 0 ? (
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">Este día aún no tiene ejercicios.</p>
          <p className="mt-1 text-sm text-gris-oscuro">
            {soloTranscripcion
              ? "Usa «Subir varios audios» para agregar los audios del día de una vez."
              : "Agrega el audio largo (transcripción o completar) y la pregunta abierta."}
          </p>
        </Tarjeta>
      ) : (
        <ol className="flex flex-col gap-3">
          {ejercicios.map((e, i) => (
            <li key={e.id}>
              <TarjetaEjercicio
                e={e}
                numero={i + 1}
                porcentaje={e.activo && pesoTotal > 0 ? Math.round((e.peso / pesoTotal) * 100) : null}
                primero={i === 0}
                ultimo={i === ejercicios.length - 1}
                deshabilitado={pendiente}
                onEditar={() => setDialogo({ tipo: "editar", ejercicio: e })}
                onAccion={correr}
              />
            </li>
          ))}
        </ol>
      )}

      <Dialogo
        abierto={dialogo?.tipo === "nuevo" || dialogo?.tipo === "editar"}
        onCerrar={cerrar}
        titulo={dialogo?.tipo === "editar" ? "Editar ejercicio" : "Agregar ejercicio"}
        ancho="max-w-2xl"
      >
        {(dialogo?.tipo === "nuevo" || dialogo?.tipo === "editar") && (
          <FormEjercicio
            diaId={diaId}
            programa={programa}
            ejercicio={dialogo.tipo === "editar" ? dialogo.ejercicio : null}
            subidaAudios={subidaAudios}
            onListo={cerrar}
            onCancelar={cerrar}
          />
        )}
      </Dialogo>

      <Dialogo abierto={dialogo?.tipo === "varios"} onCerrar={cerrar} titulo="Subir varios audios" ancho="max-w-2xl">
        {subidaAudios ? (
          <SubirVariosAudios diaId={diaId} onListo={cerrar} />
        ) : (
          <Aviso>
            La subida de archivos no está configurada (falta <code>BLOB_READ_WRITE_TOKEN</code>). Agrega cada audio con
            «Agregar ejercicio» pegando su enlace.
          </Aviso>
        )}
      </Dialogo>

      <Dialogo abierto={dialogo?.tipo === "copiar"} onCerrar={cerrar} titulo="Copiar ejercicios de otro día">
        <CopiarDia diaId={diaId} dias={diasParaCopiar} onListo={cerrar} />
      </Dialogo>
    </>
  );
}

function TarjetaEjercicio({
  e,
  numero,
  porcentaje,
  primero,
  ultimo,
  deshabilitado,
  onEditar,
  onAccion,
}: {
  e: EjercicioStaff;
  numero: number;
  porcentaje: number | null;
  primero: boolean;
  ultimo: boolean;
  deshabilitado: boolean;
  onEditar: () => void;
  onAccion: (fn: () => Promise<ResultadoAccion>) => void;
}) {
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const titulo = e.titulo?.trim() || (e.tipo === "abierta" ? "Pregunta abierta" : `Audio ${numero}`);
  const conRespuestas = e.respuestas_estudiantes > 0;

  return (
    <Tarjeta relleno="p-4 md:px-5" className={e.activo ? "" : "opacity-60"}>
      <div className="flex items-start gap-3">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-extrabold text-titulo">{titulo}</h3>
            <Insignia tono="lavanda">{ETIQUETA_TIPO[e.tipo]}</Insignia>
            {!e.activo && <Insignia tono="gris">Desactivado</Insignia>}
            {conRespuestas && (
              <Insignia tono="verde">
                {e.respuestas_estudiantes} {e.respuestas_estudiantes === 1 ? "respuesta" : "respuestas"}
              </Insignia>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-gris-oscuro">
            Peso {e.peso}
            {porcentaje !== null && ` · ${porcentaje}% del día`}
          </p>
          {e.audio_url && <audio controls preload="none" src={e.audio_url} className="mt-2 h-10 w-full max-w-[520px]" />}
          <Contenido e={e} />
        </div>
        <Menu
          etiqueta={`Acciones de ${titulo}`}
          items={[
            { texto: "Editar", onSelect: onEditar },
            ...(!primero ? [{ texto: "Subir", onSelect: () => onAccion(() => moverEjercicioAction(e.id, "arriba")), deshabilitado }] : []),
            ...(!ultimo ? [{ texto: "Bajar", onSelect: () => onAccion(() => moverEjercicioAction(e.id, "abajo")), deshabilitado }] : []),
            {
              texto: e.activo ? "Desactivar" : "Activar",
              detalle: e.activo ? "Deja de salirle a quien no lo ha hecho." : undefined,
              onSelect: () => onAccion(() => cambiarActivoEjercicioAction(e.id, !e.activo)),
              deshabilitado,
            },
            {
              texto: "Eliminar",
              peligro: true,
              deshabilitado: conRespuestas,
              detalle: conRespuestas ? "Ya tiene respuestas: desactívalo." : undefined,
              onSelect: () => setConfirmarBorrar(true),
            },
          ]}
        />
      </div>
      <Dialogo abierto={confirmarBorrar} onCerrar={() => setConfirmarBorrar(false)} titulo="¿Eliminar el ejercicio?">
        <div className="flex flex-col gap-4 text-[15px]">
          <p>
            Se elimina <strong>{titulo}</strong>. El archivo de audio no se borra del almacenamiento.
          </p>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setConfirmarBorrar(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              onClick={() => {
                setConfirmarBorrar(false);
                onAccion(() => eliminarEjercicioAction(e.id));
              }}
            >
              Eliminar
            </Boton>
          </div>
        </div>
      </Dialogo>
    </Tarjeta>
  );
}

function Contenido({ e }: { e: EjercicioStaff }) {
  const caja = "mt-2 line-clamp-3 rounded-[10px] bg-campo px-3 py-2 text-[14px] leading-relaxed whitespace-pre-line text-tinta";
  if (e.tipo === "transcripcion") return <p className={caja}>{e.transcripcion}</p>;
  if (e.tipo === "abierta")
    return (
      <p className={caja}>
        {e.enunciado}
        {e.rubrica && <span className="block text-[13px] text-gris-oscuro">Rúbrica: {e.rubrica}</span>}
      </p>
    );
  const partes = partirEnunciado(e.enunciado ?? "");
  return (
    <p className={caja}>
      {partes.map((seg, i) => (
        <span key={i}>
          {seg}
          {i < partes.length - 1 && (
            <span className="rounded bg-lavanda px-1 font-semibold text-violeta">{(e.respuestas?.[i] ?? []).join(" | ")}</span>
          )}
        </span>
      ))}
    </p>
  );
}

function TituloDia({ diaId, inicial }: { diaId: number; inicial: string | null }) {
  const [titulo, setTitulo] = useState(inicial ?? "");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiado = titulo.trim() !== (inicial ?? "");
  return (
    <Tarjeta relleno="px-5 py-4">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          iniciar(async () => {
            const r = await tituloDiaAction(diaId, titulo);
            setEstado(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
          });
        }}
      >
        <Campo
          etiqueta="Tema del día (opcional)"
          htmlFor="dia-titulo"
          error={estado && !estado.ok ? estado.texto : null}
          ayuda={estado?.ok ? estado.texto : "Lo ven los estudiantes en su calendario. Ej. «Daily routines»."}
        >
          <div className="flex gap-2">
            <Entrada
              id="dia-titulo"
              value={titulo}
              maxLength={120}
              onChange={(e) => {
                setTitulo(e.target.value);
                setEstado(null);
              }}
            />
            <Boton type="submit" variante="secundario" disabled={pendiente || !cambiado} className="shrink-0">
              Guardar
            </Boton>
          </div>
        </Campo>
      </form>
    </Tarjeta>
  );
}

function CopiarDia({ diaId, dias, onListo }: { diaId: number; dias: DiaParaCopiar[]; onListo: () => void }) {
  const [origen, setOrigen] = useState(String(dias[0]?.id ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-4 text-[15px]">
      <p>Los ejercicios activos del día elegido se agregan al final de este (con sus audios, textos y pesos).</p>
      <Campo etiqueta="Copiar desde" htmlFor="copiar-origen">
        <Selector id="copiar-origen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          {dias.map((d) => (
            <option key={d.id} value={d.id}>
              {d.etiqueta}
            </option>
          ))}
        </Selector>
      </Campo>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex justify-end">
        <Boton
          disabled={pendiente || !origen}
          onClick={() =>
            iniciar(async () => {
              setError(null);
              const r = await copiarEjerciciosAction(Number(origen), diaId);
              if (r.ok) onListo();
              else setError(r.error);
            })
          }
        >
          {pendiente ? "Copiando…" : "Copiar ejercicios"}
        </Boton>
      </div>
    </div>
  );
}

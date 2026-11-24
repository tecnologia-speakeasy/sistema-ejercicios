"use client";

import { useRef, useState } from "react";

// Audio de un ejercicio: el reproductor del navegador (sin límite de
// reproducciones) y, para el dictado, la velocidad (más lento ayuda a
// transcribir) y "‹ 5 s" para repetir el último trozo.
const VELOCIDADES = [0.75, 1] as const;

export function ReproductorAudio({ src, etiqueta = "Audio" }: { src: string; etiqueta?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [velocidad, setVelocidad] = useState<number>(1);

  function cambiarVelocidad(v: number) {
    setVelocidad(v);
    if (audio.current) audio.current.playbackRate = v;
  }

  function retroceder() {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime - 5);
    void a.play().catch(() => {});
  }

  return (
    <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-[18px] py-4 md:px-[22px]">
      <span className="mb-2 inline-block rounded-full bg-lavanda px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-violeta uppercase">
        Listening
      </span>
      <audio
        ref={audio}
        controls
        preload="metadata"
        src={src}
        aria-label={etiqueta}
        onLoadedMetadata={(e) => (e.currentTarget.playbackRate = velocidad)}
        className="w-full"
      >
        Tu navegador no puede reproducir este audio.
      </audio>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]">
        <button
          type="button"
          onClick={retroceder}
          className="cursor-pointer rounded-full border-[1.5px] border-borde bg-white px-3 py-1 font-semibold text-gris-oscuro hover:border-rosa hover:text-rosa"
        >
          ‹ 5 s
        </button>
        <span className="ml-auto text-gris">Velocidad</span>
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={velocidad === v}
            onClick={() => cambiarVelocidad(v)}
            className={`cursor-pointer rounded-full px-3 py-1 font-semibold transition-colors ${
              velocidad === v ? "bg-rosa text-white" : "border-[1.5px] border-borde bg-white text-gris-oscuro hover:border-rosa"
            }`}
          >
            {v === 1 ? "Normal" : `${v}×`}
          </button>
        ))}
      </div>
    </div>
  );
}

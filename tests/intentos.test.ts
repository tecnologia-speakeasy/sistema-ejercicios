import { describe, expect, it } from "vitest";
import type { DiaEstudiante } from "@/lib/datos/entregas";
import { calificarEjercicio } from "@/lib/ejercicios/calificar";
import { sinCorrectas } from "@/lib/ejercicios/ocultar";
import { calificarTranscripcion } from "@/lib/ejercicios/transcripcion";
import { accionRepetir, leerIntento } from "@/lib/intentos";

describe("sinCorrectas (le quedan intentos)", () => {
  it("transcripción: quita lo que decía el audio y la palabra correcta, deja lo que escribió", () => {
    const { detalle } = calificarTranscripcion("The yellow house is big.", "The hello house big");
    const r = sinCorrectas({ tipo: "transcripcion" as const, transcripcion: "The yellow house is big.", correctas: null, detalle });
    expect(r.transcripcion).toBeNull();
    expect(JSON.stringify(r)).not.toContain("yellow");
    expect(r.detalle?.ops).toEqual([
      { t: "ok", p: "the" },
      { t: "cambio", p: "", dada: "hello" },
      { t: "ok", p: "house" },
      { t: "falta", p: "" },
      { t: "ok", p: "big" },
    ]);
  });
  it("completar: quita las respuestas aceptadas y deja qué espacios acertó", () => {
    const ej = {
      id: 1,
      tipo: "completar" as const,
      peso: 70,
      transcripcion: null,
      respuestas: [["usually", "normally"], ["seven", "7"]],
    };
    const { detalle } = calificarEjercicio(ej, ["usually", "eight"]);
    const r = sinCorrectas({ tipo: "completar" as const, transcripcion: null, correctas: ej.respuestas, detalle });
    expect(r.correctas).toBeNull();
    expect(JSON.stringify(r)).not.toContain("seven");
    expect(r.detalle).toEqual(detalle);
  });
});

describe("leerIntento", () => {
  it("acepta 1 o 2; lo demás es null (= el último)", () => {
    expect(leerIntento("1")).toBe(1);
    expect(leerIntento("2")).toBe(2);
    for (const v of [undefined, "", "0", "3", "1.5", "x", ["1"]]) expect(leerIntento(v)).toBeNull();
  });
});

describe("accionRepetir", () => {
  const dia = (cambios: Partial<DiaEstudiante>): DiaEstudiante => ({
    id: 1,
    fecha: "2026-12-09",
    numero: 1,
    titulo: null,
    ejercicios: 10,
    es_hoy: true,
    estado: "completado",
    puntaje: 70,
    intentos: 1,
    puede_repetir: true,
    correctas_visibles: false,
    ...cambios,
  });
  it("ofrece repetir si le queda un intento", () => {
    expect(accionRepetir("2026-12-09", dia({}))).toEqual({
      href: "/dia/2026-12-09?repetir=1",
      texto: "Repetir el día (te queda 1 intento)",
    });
  });
  it("con el segundo intento a medias, lo continúa", () => {
    expect(accionRepetir("2026-12-09", dia({ estado: "en_curso", puede_repetir: false }))).toEqual({
      href: "/dia/2026-12-09",
      texto: "Continuar intento 2",
    });
  });
  it("sin intentos o con el día cerrado, nada", () => {
    expect(accionRepetir("2026-12-09", dia({ intentos: 2, puede_repetir: false, correctas_visibles: true }))).toBeNull();
  });
});

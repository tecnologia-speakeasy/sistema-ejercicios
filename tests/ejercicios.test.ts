import { describe, expect, it } from "vitest";
import { calificarEjercicio, puntajeDia } from "@/lib/ejercicios/calificar";
import { armarMarcado, leerMarcado } from "@/lib/ejercicios/completar";
import { calificarTranscripcion, palabrasTranscripcion } from "@/lib/ejercicios/transcripcion";
import { numeroDia, pesoPorDefecto } from "@/lib/tipos";

describe("palabrasTranscripcion", () => {
  it("ignora mayúsculas, puntuación, tildes y apóstrofes", () => {
    expect(palabrasTranscripcion("Hello, María! It’s 7 o'clock.")).toEqual([
      "hello", "maria", "its", "seven", "oclock",
    ]);
  });
  it("expande contracciones negativas y números", () => {
    expect(palabrasTranscripcion("I don't have 21 cats")).toEqual(["i", "do", "not", "have", "twenty", "one", "cats"]);
    expect(palabrasTranscripcion("I do not have twenty-one cats")).toEqual(palabrasTranscripcion("I don't have 21 cats"));
    expect(palabrasTranscripcion("She can't")).toEqual(["she", "can", "not"]);
    expect(palabrasTranscripcion("105 people")).toEqual(["one", "hundred", "five", "people"]);
  });
});

describe("calificarTranscripcion", () => {
  it("transcripción perfecta = 1", () => {
    const r = calificarTranscripcion("I usually wake up at seven.", "i usually wake up at 7");
    expect(r.nota).toBe(1);
    expect(r.detalle.aciertos).toBe(6);
  });
  it("cuenta cambios, faltantes y sobrantes", () => {
    const r = calificarTranscripcion("I usually wake up at seven", "I wake up at eleven please");
    // falta "usually", cambia seven→eleven, sobra "please": 3 errores de 6
    expect(r.nota).toBe(0.5);
    expect(r.detalle.ops).toEqual([
      { t: "ok", p: "i" },
      { t: "falta", p: "usually" },
      { t: "ok", p: "wake" },
      { t: "ok", p: "up" },
      { t: "ok", p: "at" },
      { t: "cambio", p: "seven", dada: "eleven" },
      { t: "sobra", dada: "please" },
    ]);
  });
  it("vacía o con mucho de sobra = 0, nunca negativa", () => {
    expect(calificarTranscripcion("Hello there", "").nota).toBe(0);
    expect(calificarTranscripcion("Hi", "a b c d e f").nota).toBe(0);
  });
});

describe("completar", () => {
  it("lee y arma el texto marcado", () => {
    const m = leerMarcado("I [usually|normally] wake up at [seven | 7] o'clock.");
    expect(m).toEqual({
      ok: true,
      enunciado: "I ___ wake up at ___ o'clock.",
      respuestas: [["usually", "normally"], ["seven", "7"]],
    });
    if (m.ok) expect(armarMarcado(m.enunciado, m.respuestas)).toBe("I [usually|normally] wake up at [seven|7] o'clock.");
  });
  it("rechaza marcas mal hechas", () => {
    expect(leerMarcado("Sin espacios").ok).toBe(false);
    expect(leerMarcado("I [usually wake").ok).toBe(false);
    expect(leerMarcado("I usually] wake").ok).toBe(false);
    expect(leerMarcado("I [] wake").ok).toBe(false);
    expect(leerMarcado("I ___ wake [up]").ok).toBe(false);
  });
  it("califica por espacios con normalize()", () => {
    const e = { id: 1, tipo: "completar" as const, peso: 70, transcripcion: null, respuestas: [["usually"], ["seven", "7"]] };
    expect(calificarEjercicio(e, ["Usually", "7"]).nota).toBe(1);
    expect(calificarEjercicio(e, ["often", "7"]).nota).toBe(0.5);
    expect(calificarEjercicio(e, ["", ""])).toMatchObject({ respuesta: null, nota: 0 });
  });
});

describe("abierta y puntaje del día", () => {
  it("abierta con texto queda pendiente; vacía es 0", () => {
    const e = { id: 2, tipo: "abierta" as const, peso: 30, transcripcion: null, respuestas: null };
    expect(calificarEjercicio(e, "I like the beach").nota).toBeNull();
    expect(calificarEjercicio(e, "  ").nota).toBe(0);
  });
  it("G1: el audio pesa 70 y la abierta 30", () => {
    expect(pesoPorDefecto("audio_largo", "transcripcion")).toBe(70);
    expect(pesoPorDefecto("audio_largo", "abierta")).toBe(30);
    expect(puntajeDia([{ nota: 1, peso: 70 }, { nota: 0, peso: 30 }])).toBe(70);
    expect(puntajeDia([{ nota: 0.5, peso: 70 }, { nota: 0.8, peso: 30 }])).toBe(59);
    expect(puntajeDia([{ nota: 1, peso: 70 }, { nota: null, peso: 30 }])).toBeNull();
  });
  it("G2: todos valen lo mismo", () => {
    expect(pesoPorDefecto("audios_cortos", "transcripcion")).toBe(10);
    const notas = [1, 1, 1, 1, 1, 0.5, 0.5, 0, 0, 1].map((nota) => ({ nota, peso: 10 }));
    expect(puntajeDia(notas)).toBe(70);
  });
});

describe("numeroDia", () => {
  it("cuenta desde el primer día", () => {
    expect(numeroDia("2026-12-09", "2026-12-09")).toBe(1);
    expect(numeroDia("2027-01-04", "2026-12-09")).toBe(27);
  });
});

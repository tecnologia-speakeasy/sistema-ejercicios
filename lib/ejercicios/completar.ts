// "Completar el texto": el admin escribe el texto marcando cada palabra que
// falta entre corchetes, con sus variantes separadas por "|":
//
//   I [usually|normally] wake up at [seven|7] o'clock.
//
// En la BD queda separado (db/001: validar_ejercicio):
//   enunciado  = "I ___ wake up at ___ o'clock."          (lo ve el estudiante)
//   respuestas = [["usually","normally"],["seven","7"]]    (secreto)
// Puro: lo usan el editor (navegador) y el servidor.

export const ESPACIO = "___";
const PATRON_ESPACIO = /_{3,}/g;

export function contarEspacios(enunciado: string): number {
  return (enunciado.match(PATRON_ESPACIO) ?? []).length;
}

// "I ___ wake up" → ["I ", " wake up"] (un trozo más que espacios).
export function partirEnunciado(enunciado: string): string[] {
  return enunciado.split(PATRON_ESPACIO);
}

export type Marcado =
  | { ok: true; enunciado: string; respuestas: string[][] }
  | { ok: false; error: string };

export function leerMarcado(texto: string): Marcado {
  const limpio = texto.replace(/\r\n/g, "\n").trim();
  if (!limpio) return { ok: false, error: "Escribe el texto." };
  if (/_{3,}/.test(limpio)) {
    return { ok: false, error: "No uses ___ en el texto: marca las palabras que faltan entre [corchetes]." };
  }
  const respuestas: string[][] = [];
  let enunciado = "";
  let i = 0;
  while (i < limpio.length) {
    const abre = limpio.indexOf("[", i);
    const cierraSuelto = limpio.indexOf("]", i);
    if (cierraSuelto !== -1 && (abre === -1 || cierraSuelto < abre)) {
      return { ok: false, error: "Hay un «]» sin su «[». Revisa los corchetes." };
    }
    if (abre === -1) {
      enunciado += limpio.slice(i);
      break;
    }
    const cierra = limpio.indexOf("]", abre + 1);
    if (cierra === -1) return { ok: false, error: "Hay un «[» sin cerrar. Revisa los corchetes." };
    const dentro = limpio.slice(abre + 1, cierra);
    if (dentro.includes("[")) return { ok: false, error: "Hay corchetes dentro de otros. Revisa el texto." };
    const variantes = [...new Set(dentro.split("|").map((v) => v.replace(/\s+/g, " ").trim()).filter(Boolean))];
    if (variantes.length === 0) {
      return { ok: false, error: `El espacio ${respuestas.length + 1} está vacío: escribe la palabra entre los corchetes.` };
    }
    respuestas.push(variantes);
    enunciado += limpio.slice(i, abre) + ESPACIO;
    i = cierra + 1;
  }
  if (respuestas.length === 0) {
    return { ok: false, error: "Marca al menos una palabra entre [corchetes]: esa será la que el estudiante completa." };
  }
  return { ok: true, enunciado, respuestas };
}

// Lo inverso, para editar un ejercicio guardado.
export function armarMarcado(enunciado: string, respuestas: string[][]): string {
  const trozos = partirEnunciado(enunciado);
  return trozos
    .map((t, i) => (i < trozos.length - 1 ? `${t}[${(respuestas[i] ?? [""]).join("|")}]` : t))
    .join("");
}

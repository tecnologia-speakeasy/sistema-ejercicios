// Calificación de una transcripción literal: se comparan las palabras del
// estudiante con las del audio (alineación de Levenshtein por palabras).
//
//   precisión = 1 − (cambiadas + faltantes + sobrantes) / palabras del audio
//   (como 1 − WER; nunca baja de 0)
//
// No cuentan: mayúsculas, tildes, puntuación, el tipo de apóstrofe, las
// contracciones negativas (don't = do not) ni escribir los números en cifras
// o en letras (7 = seven, 21 = twenty-one). Puro: sin BD.

export type Operacion =
  /** La palabra coincide. */
  | { t: "ok"; p: string }
  /** Escribió otra palabra en su lugar. */
  | { t: "cambio"; p: string; dada: string }
  /** No escribió esta palabra del audio. */
  | { t: "falta"; p: string }
  /** Escribió una palabra que no está en el audio. */
  | { t: "sobra"; dada: string };

export type DetalleTranscripcion = {
  palabras: number;
  aciertos: number;
  ops: Operacion[];
};

const UNIDADES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const DECENAS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// 0–999 en letras ("105" → "one hundred five"); otros números se dejan igual.
function numeroEnLetras(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) return DECENAS[Math.floor(n / 10)] + (n % 10 ? ` ${UNIDADES[n % 10]}` : "");
  return `${UNIDADES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numeroEnLetras(n % 100)}` : ""}`;
}

export function palabrasTranscripcion(texto: string): string[] {
  return String(texto ?? "")
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes
    .replace(/[‘’ʼ´`']/g, "'") // apóstrofes
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bcannot\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/n't\b/g, " not")
    .replace(/(\d),(\d{3})\b/g, "$1$2") // 1,000 → 1000
    .replace(/\b\d{1,3}\b/g, (m) => numeroEnLetras(Number(m)))
    .replace(/[-–—/]/g, " ") // twenty-one = twenty one
    .replace(/[^\p{L}\p{N}'\s]/gu, " ") // puntuación
    .replace(/'/g, "") // it's = its (el apóstrofo no se califica)
    .split(/\s+/)
    .filter(Boolean);
}

// Alineación de mínimo costo (cambiar, faltar, sobrar = 1). Se calcula sobre
// los finales (d[i][j] = costo de alinear audio[i..] con dadas[j..]) y se
// recorre de izquierda a derecha prefiriendo coincidir, luego cambiar, luego
// faltar: así se lee natural y lo que sobra al final queda al final.
export function alinear(audio: string[], dadas: string[]): Operacion[] {
  const n = audio.length;
  const m = dadas.length;
  const d: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][m] = n - i;
  for (let j = 0; j <= m; j++) d[n][j] = m - j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const igual = audio[i] === dadas[j] ? 0 : 1;
      d[i][j] = Math.min(d[i + 1][j + 1] + igual, d[i + 1][j] + 1, d[i][j + 1] + 1);
    }
  }
  const ops: Operacion[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && audio[i] === dadas[j] && d[i][j] === d[i + 1][j + 1]) {
      ops.push({ t: "ok", p: audio[i] });
      i++;
      j++;
    } else if (i < n && j < m && d[i][j] === d[i + 1][j + 1] + 1) {
      ops.push({ t: "cambio", p: audio[i], dada: dadas[j] });
      i++;
      j++;
    } else if (i < n && d[i][j] === d[i + 1][j] + 1) {
      ops.push({ t: "falta", p: audio[i] });
      i++;
    } else {
      ops.push({ t: "sobra", dada: dadas[j] });
      j++;
    }
  }
  return ops;
}

export function calificarTranscripcion(
  audio: string,
  dada: string | null,
): { nota: number; detalle: DetalleTranscripcion } {
  const esperadas = palabrasTranscripcion(audio);
  const escritas = palabrasTranscripcion(dada ?? "");
  const ops = alinear(esperadas, escritas);
  const aciertos = ops.filter((o) => o.t === "ok").length;
  const errores = ops.length - aciertos;
  const nota = esperadas.length === 0 ? 0 : Math.max(0, 1 - errores / esperadas.length);
  return { nota: Math.round(nota * 10_000) / 10_000, detalle: { palabras: esperadas.length, aciertos, ops } };
}

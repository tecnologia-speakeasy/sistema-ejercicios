import type { DiaEstudiante } from "@/lib/datos/entregas";
import { MAX_INTENTOS } from "@/lib/tipos";

// Piezas de los intentos que comparten el resultado y la revisión del
// estudiante. Puro (sin BD).

/** ?intento=N de la URL: un número de intento válido o null (= el último). */
export function leerIntento(valor: string | string[] | undefined): number | null {
  const n = Number(valor);
  return typeof valor === "string" && Number.isInteger(n) && n >= 1 && n <= MAX_INTENTOS ? n : null;
}

/** "Repetir el día" (o seguir el intento que dejó a medias), si puede. */
export function accionRepetir(fecha: string, dia: DiaEstudiante): { href: string; texto: string } | null {
  if (dia.estado === "en_curso") return { href: `/dia/${fecha}`, texto: `Continuar intento ${dia.intentos + 1}` };
  if (!dia.puede_repetir) return null;
  const quedan = MAX_INTENTOS - dia.intentos;
  return { href: `/dia/${fecha}?repetir=1`, texto: `Repetir el día (te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan}`})` };
}

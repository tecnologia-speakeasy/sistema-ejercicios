// Rangos de calificación de la pantalla de resultado (los de sistema-evaluaciones):
// cada rango cambia la imagen y el texto según el puntaje (0–100). Se evalúa de
// menor a mayor: gana el primer rango cuyo `hasta` cubra el puntaje (límite
// superior INCLUIDO).

export type Celebracion = { img: string; titulo: string; sub: string };

const SIGUE = "Cada día de práctica cuenta: revisa lo que decía cada audio y vuelve mañana.";
const BIEN = "Vas por buen camino: practicar todos los días es lo que más ayuda.";
const FRUTOS = "Tu práctica está dando frutos. ¡Sigue así!";

export const RANGOS_CELEBRACION: (Celebracion & { hasta: number })[] = [
  { hasta: 20, img: "/calificaciones/20.png", titulo: "¡Gracias por intentarlo!", sub: SIGUE }, // 0 a 20
  { hasta: 50, img: "/calificaciones/50.png", titulo: "¡Gracias por intentarlo!", sub: SIGUE }, // 21 a 50
  { hasta: 60, img: "/calificaciones/60.png", titulo: "¡Gracias por intentarlo!", sub: SIGUE }, // 51 a 60
  { hasta: 70, img: "/calificaciones/70.png", titulo: "¡Gracias por intentarlo!", sub: SIGUE }, // 61 a 70
  { hasta: 80, img: "/calificaciones/80.png", titulo: "¡Lo estás haciendo bien!", sub: BIEN }, // 71 a 80
  { hasta: 90, img: "/calificaciones/90.png", titulo: "¡Felicitaciones!", sub: FRUTOS }, // 81 a 90
  { hasta: 100, img: "/calificaciones/100.png", titulo: "¡Felicitaciones!", sub: FRUTOS }, // 91 a 100
];

// Si el puntaje llega vacío o fuera de rango.
export const CELEBRACION_POR_DEFECTO: Celebracion = { img: "/TROFEO.png", titulo: "¡Felicitaciones!", sub: FRUTOS };

export function celebracionPorPuntaje(puntaje: number | null | undefined): Celebracion {
  if (typeof puntaje === "number" && Number.isFinite(puntaje)) {
    const rango = RANGOS_CELEBRACION.find((r) => puntaje <= r.hasta);
    if (rango) return { img: rango.img, titulo: rango.titulo, sub: rango.sub };
  }
  return CELEBRACION_POR_DEFECTO;
}

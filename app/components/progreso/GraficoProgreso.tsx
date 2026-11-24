// Progreso por día (SVG, sin librerías), con el estilo de "Mi historial" de
// sistema-evaluaciones: cada día de la generación en el eje y, en los que ya
// entregó, su puntaje. Los colores son los del degradado de progreso.

export type PuntoProgreso = { numero: number; fecha: string; puntaje: number | null };

const ALTO = 220;
const M = { arriba: 28, abajo: 34, izq: 34, der: 18 };
const PASO = 26; // px por día

export function GraficoProgreso({ dias }: { dias: PuntoProgreso[] }) {
  const n = Math.max(dias.length, 2);
  const ANCHO = Math.max(560, M.izq + M.der + (n - 1) * PASO);
  const ancho = ANCHO - M.izq - M.der;
  const alto = ALTO - M.arriba - M.abajo;
  const x = (i: number) => M.izq + (i / (n - 1)) * ancho;
  const y = (p: number) => M.arriba + alto - (p / 100) * alto;
  const puntos = dias.flatMap((d, i) => (d.puntaje === null ? [] : [{ ...d, i, puntaje: d.puntaje }]));
  const linea = puntos.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.puntaje).toFixed(1)}`).join(" ");
  const area =
    puntos.length > 1
      ? `${linea} L${x(puntos.at(-1)!.i).toFixed(1)},${y(0)} L${x(puntos[0].i).toFixed(1)},${y(0)} Z`
      : "";
  const etiqueta = puntos.length
    ? `Tu puntaje por día: ${puntos.map((p) => `día ${p.numero} ${p.puntaje}`).join(", ")}`
    : "Aún no tienes puntajes";

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={etiqueta} className="h-auto w-full" style={{ minWidth: ANCHO }}>
      <defs>
        <linearGradient id="progreso-linea" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#6d2ebf" />
          <stop offset="100%" stopColor="#ff327d" />
        </linearGradient>
        <linearGradient id="progreso-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ff327d" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6d2ebf" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={M.izq} x2={ANCHO - M.der} y1={y(v)} y2={y(v)} stroke="#e3ddf0" strokeDasharray={v ? "4 5" : undefined} />
          <text x={M.izq - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9a93ad">
            {v}
          </text>
        </g>
      ))}
      {area && <path d={area} fill="url(#progreso-area)" />}
      {puntos.length > 1 && (
        <path d={linea} fill="none" stroke="url(#progreso-linea)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {dias.map((d, i) => (
        <text
          key={d.fecha}
          x={x(i)}
          y={ALTO - 12}
          textAnchor="middle"
          fontSize="11"
          fontWeight={d.puntaje !== null ? 800 : 600}
          fill={d.puntaje !== null ? "#ff327d" : "#b3abc6"}
        >
          {d.numero}
        </text>
      ))}
      {puntos.map((p) => (
        <g key={p.fecha}>
          <circle cx={x(p.i)} cy={y(p.puntaje)} r="5" fill="#fff" stroke="#ff327d" strokeWidth="3" />
          <text x={x(p.i)} y={y(p.puntaje) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#2b2240">
            {p.puntaje}
          </text>
        </g>
      ))}
    </svg>
  );
}

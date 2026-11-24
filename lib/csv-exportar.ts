// Una celda de CSV para Excel en español (separador ";"). Los textos que
// empiezan con = + - @ llevan un apóstrofo delante (inyección de fórmulas).
export function celdaCsv(valor: string): string {
  let v = valor ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

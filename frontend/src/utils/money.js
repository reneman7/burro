/** Formatea un monto de créditos/fichas siempre con 2 decimales (ej. 12.5 -> "12.50"). */
export function formatMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : value;
}

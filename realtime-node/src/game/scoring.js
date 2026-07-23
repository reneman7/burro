const POINTS_TO_SAVE = 2;

/**
 * Calcula el resultado económico de una mano ya jugada.
 *
 * - Los que entraron y llegaron a 2+ puntos se salvan (para esta mano).
 * - Los que no se salvan pagan, cada uno, el valor actual del fondo
 *   acumulado; ese dinero (aparte del fondo, que no se toca) se reparte en
 *   partes iguales entre los salvados de esta mano.
 * - Excepción: si nadie se salva (solo posible con 5 entrantes, 1 punto cada
 *   uno), lo pagado se queda acumulado en el fondo en vez de repartirse
 *   (no hay a quién repartírselo).
 * - Si el pago total no se divide exacto entre los salvados, el residuo de
 *   redondeo se sostiene en el fondo (no se inventa ni se pierden fichas).
 *
 * @param {Array<string|number>} entrants ids de quienes entraron a esta mano
 * @param {Record<string, number>} pointsByUser puntos (0-5) de cada entrante en esta mano
 * @param {number} currentFondo valor actualmente acumulado en la mesa
 * @returns {{
 *   saved: Array<string|number>,
 *   notSaved: Array<string|number>,
 *   paymentPerLoser: number,
 *   totalCollected: number,
 *   payoutPerWinner: number,
 *   payouts: Record<string, number>,
 *   newFondo: number,
 *   partidaEnds: boolean,
 * }}
 */
export function computeManoPayments(entrants, pointsByUser, currentFondo) {
  const saved = entrants.filter((id) => (pointsByUser[id] ?? 0) >= POINTS_TO_SAVE);
  const notSaved = entrants.filter((id) => (pointsByUser[id] ?? 0) < POINTS_TO_SAVE);

  const paymentPerLoser = notSaved.length > 0 ? currentFondo : 0;
  const totalCollected = paymentPerLoser * notSaved.length;

  const payouts = {};
  let newFondo = currentFondo;

  if (totalCollected > 0 && saved.length > 0) {
    const payoutPerWinner = Math.floor(totalCollected / saved.length);
    const remainder = totalCollected - payoutPerWinner * saved.length;
    for (const id of saved) payouts[id] = payoutPerWinner;
    newFondo = currentFondo + remainder; // el residuo de redondeo se queda en el fondo
  } else if (totalCollected > 0 && saved.length === 0) {
    // Nadie se salvó: lo pagado se queda acumulado en el fondo.
    newFondo = currentFondo + totalCollected;
  }

  const partidaEnds = entrants.length > 0 && notSaved.length === 0;

  return {
    saved,
    notSaved,
    paymentPerLoser,
    totalCollected,
    payoutPerWinner: saved.length > 0 ? Math.floor(totalCollected / saved.length) : 0,
    payouts,
    newFondo,
    partidaEnds,
  };
}

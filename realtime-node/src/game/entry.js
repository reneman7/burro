/**
 * Resuelve quiénes entran a una mano optativa. Las decisiones se toman en el
 * mismo orden que el reparto (empezando a la derecha del dealer, terminando
 * en el dealer), de forma secuencial: cada jugador ve quién ya entró antes
 * de decidir. El dealer, si ve que nadie más entró, queda forzado a entrar
 * (garantiza mínimo 1 entrante siempre).
 *
 * @param {Array<string|number>} seatOrderFromDealerRight
 * @param {string|number} dealerId
 * @param {(userId: string|number, entrantsSoFar: Array<string|number>) => boolean} decisionFn
 *        Se llama en orden para cada jugador que no sea el dealer forzado;
 *        devuelve true si ese jugador decide entrar.
 * @returns {Array<string|number>} ids de los jugadores que entraron, en orden de turno
 */
export function resolveEntrants(seatOrderFromDealerRight, dealerId, decisionFn) {
  const entrants = [];

  for (const userId of seatOrderFromDealerRight) {
    const isDealer = userId === dealerId;
    const isDealerForced = isDealer && entrants.length === 0;

    const entered = isDealerForced ? true : decisionFn(userId, [...entrants]);

    if (entered) {
      entrants.push(userId);
    }
  }

  return entrants;
}

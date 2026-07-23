import { randomInt } from 'node:crypto';

// Los 4 palos en español, coincidiendo con el ENUM de la base de datos.
export const SUITS = ['diamantes', 'espadas', 'corazones', 'treboles'];

// Orden de menor a mayor: el As es la carta más baja, el Rey la más alta.
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUIT_CODE = { diamantes: 'D', espadas: 'E', corazones: 'C', treboles: 'T' };
const CODE_SUIT = Object.fromEntries(Object.entries(SUIT_CODE).map(([k, v]) => [v, k]));

export function rankValue(rank) {
  const i = RANKS.indexOf(rank);
  if (i === -1) throw new Error(`Rango de carta inválido: ${rank}`);
  return i;
}

/** true si `a` es una carta de mayor valor que `b` (mismo palo, se asume). */
export function isHigherRank(a, b) {
  return rankValue(a) > rankValue(b);
}

export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

/** Fisher-Yates con crypto.randomInt (no Math.random) ya que hay apuestas de por medio. */
export function shuffle(cards) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardCode(card) {
  return `${card.rank}${SUIT_CODE[card.suit]}`;
}

export function parseCard(code) {
  const suit = CODE_SUIT[code.slice(-1)];
  const rank = code.slice(0, -1);
  if (!suit || !RANKS.includes(rank)) {
    throw new Error(`Código de carta inválido: ${code}`);
  }
  return { rank, suit };
}

export function sameCard(a, b) {
  return a.rank === b.rank && a.suit === b.suit;
}

const SUIT_SYMBOL = { diamantes: '♦', espadas: '♠', corazones: '♥', treboles: '♣' };
const RED_SUITS = new Set(['diamantes', 'corazones']);

export default function Card({ card, onClick, selectable, selected, small, faceDown }) {
  if (faceDown) {
    return <div className={`card card-back ${small ? 'card-small' : ''}`} />;
  }
  if (!card) return null;

  const isRed = RED_SUITS.has(card.suit);
  const classes = [
    'card',
    isRed ? 'card-red' : 'card-black',
    selectable ? 'card-selectable' : 'card-disabled',
    selected ? 'card-selected' : '',
    small ? 'card-small' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={selectable ? onClick : undefined} disabled={!selectable}>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}

export { SUIT_SYMBOL };

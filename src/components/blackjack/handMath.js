/** Hand read-outs for the table. Only ever called with cards that are visibly face up. */

const cardPoints = (c) => (c.rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.rank) ? 10 : parseInt(c.rank, 10));

export const evaluate = (cards) => {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c.rank === 'A') aces += 1;
  }
  let hard = total - aces * 10;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = total <= 21 && total !== hard;
  return { total, hard, soft, bust: total > 21 };
};

/** "Blackjack", "Bust", "7 / 17" for a soft hand, otherwise the plain total. */
export const handLabel = (cards, { natural = false } = {}) => {
  if (!cards.length) return null;
  const v = evaluate(cards);
  if (natural && cards.length === 2 && v.total === 21) return { text: 'Blackjack', aria: 'Blackjack', kind: 'blackjack' };
  if (v.bust) return { text: 'Bust', aria: `Bust, ${v.total}`, kind: 'bust' };
  if (v.soft && v.total < 21) return { text: `${v.hard} / ${v.total}`, aria: `Soft ${v.total}`, kind: 'soft' };
  return { text: String(v.total), aria: String(v.total), kind: 'hard' };
};

export const OUTCOME_WORD = {
  win: 'Win',
  lose: 'Loss',
  loss: 'Loss',
  push: 'Push',
  bust: 'Bust',
  blackjack: 'Blackjack',
  surrender: 'Surrender',
};

/** Greedy split of an amount into chip values (used to rebuild a bet from a number). */
export const chipBreakdown = (amount, values = [1000, 500, 100, 25, 5, 1]) => {
  let rest = Math.round(amount);
  const out = [];
  for (const v of [...values].sort((a, b) => b - a)) {
    while (rest >= v) {
      out.push(v);
      rest -= v;
    }
  }
  return out.reverse(); // small chips first, so Undo removes the largest last placed
};

/** Money with cents only when needed (3:2 on an odd bet, half-bet insurance). */
export const moneyOpts = (n, opts = {}) => ({ ...opts, cents: !Number.isInteger(n) });

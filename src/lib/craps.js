/**
 * Craps engine.
 *
 * Rules implemented (standard Vegas rules, one shooter, whole-dollar bets):
 *
 *  Line bets      Pass line / Don't pass (come-out only, 1:1; don't pass bars 12 = push).
 *                 Pass line is a contract bet: it can't be taken down once a point is set.
 *  Come bets      Come / Don't come (point phase only, 1:1; don't come bars 12 = push).
 *                 A come bet travels to its number and becomes a contract bet.
 *  Odds           Pass odds (3-4-5x: 3x on 4/10, 4x on 5/9, 5x on 6/8) pay true odds
 *                 2:1 / 3:2 / 6:5. Come odds follow the same limits. Don't pass and
 *                 don't come lay odds (up to 6x the flat bet) pay 1:2 / 2:3 / 5:6.
 *                 Come / lay odds are OFF on a come-out roll (returned, never lost).
 *  Field          One roll. Wins on 2 3 4 9 10 11 12, pays 1:1, and 2:1 on BOTH 2 and 12.
 *  Place          4/10 pay 9:5, 5/9 pay 7:5, 6/8 pay 7:6. Off on the come-out roll,
 *                 lose on a seven out, stay up after a win.
 *  Big 6 / Big 8  1:1, always working, lose on any 7, stay up after a win.
 *  Hardways       Hard 4/10 pay 7:1, hard 6/8 pay 9:1. Off on the come-out roll, lose on
 *                 the easy way or any 7, stay up after a win.
 *  One roll       Any seven 4:1, any craps 7:1, and single-number horn bets:
 *                 2 and 12 pay 30:1, 3 and 11 pay 15:1.
 *
 *  Winnings are paid in whole dollars (fractions round down).
 *  Table limits: $5 minimum / $500 maximum on every spot; proposition and odds bets may
 *  start at $1 (odds are capped by their multiple instead of the table maximum).
 *
 * Money convention for every outcome:
 *   amount  stake that was at risk on that bet
 *   payout  cash handed back to the player now (stake + winnings when the stake leaves
 *           the table; winnings only when `stays` is true)
 *   stays   true when the stake remains on the table after the roll
 *   net     payout - (stays ? 0 : amount)   -> the player's profit or loss on the bet
 */

import { generateDiceRoll, generateSeed } from '../utils/provablyFair';

export const POINTS = [4, 5, 6, 8, 9, 10];
export const HARD_NUMBERS = [4, 6, 8, 10];
export const HORN_NUMBERS = [2, 3, 11, 12];

export const TABLE_LIMITS = Object.freeze({ min: 5, max: 500, propMin: 1, oddsMin: 1 });
export const ODDS_MULTIPLE = Object.freeze({ 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 });
export const LAY_MULTIPLE = 6;

// [numerator, denominator] ratios
export const PLACE_RATIO = Object.freeze({ 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] });
export const TRUE_ODDS_RATIO = Object.freeze({ 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] });
export const LAY_RATIO = Object.freeze({ 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] });
export const HARDWAY_PAYS = Object.freeze({ 4: 7, 6: 9, 8: 9, 10: 7 });
export const HORN_PAYS = Object.freeze({ 2: 30, 3: 15, 11: 15, 12: 30 });
export const ANY_SEVEN_PAYS = 4;
export const ANY_CRAPS_PAYS = 7;

const ratioPay = (amount, [num, den]) => Math.floor((amount * num) / den);

/* ------------------------------------------------------------------ */
/* Bets container helpers                                              */
/* ------------------------------------------------------------------ */

const zeroMap = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
const zeroNumbers = () => Object.fromEntries(POINTS.map((n) => [n, { amount: 0, odds: 0 }]));

export const createEmptyBets = () => ({
  passLine: 0,
  dontPass: 0,
  come: 0, // Come bet in the come box, waiting for the next roll
  dontCome: 0,
  field: 0,
  odds: 0, // Odds behind the pass line
  dontPassOdds: 0, // Lay odds behind the don't pass
  big6: 0,
  big8: 0,
  comeNumbers: zeroNumbers(), // Come bets that have travelled to a number (+ their odds)
  dontComeNumbers: zeroNumbers(),
  place: zeroMap(POINTS),
  hardways: zeroMap(HARD_NUMBERS),
  anySeven: 0,
  anyCraps: 0,
  horn: zeroMap(HORN_NUMBERS),
});

export const cloneBets = (b) => ({
  passLine: b.passLine || 0,
  dontPass: b.dontPass || 0,
  come: b.come || 0,
  dontCome: b.dontCome || 0,
  field: b.field || 0,
  odds: b.odds || 0,
  dontPassOdds: b.dontPassOdds || 0,
  big6: b.big6 || 0,
  big8: b.big8 || 0,
  anySeven: b.anySeven || 0,
  anyCraps: b.anyCraps || 0,
  comeNumbers: Object.fromEntries(POINTS.map((n) => [n, { amount: b.comeNumbers?.[n]?.amount || 0, odds: b.comeNumbers?.[n]?.odds || 0 }])),
  dontComeNumbers: Object.fromEntries(POINTS.map((n) => [n, { amount: b.dontComeNumbers?.[n]?.amount || 0, odds: b.dontComeNumbers?.[n]?.odds || 0 }])),
  place: Object.fromEntries(POINTS.map((n) => [n, b.place?.[n] || 0])),
  hardways: Object.fromEntries(HARD_NUMBERS.map((n) => [n, b.hardways?.[n] || 0])),
  horn: Object.fromEntries(HORN_NUMBERS.map((n) => [n, b.horn?.[n] || 0])),
});

/** Every dollar currently on the table (flat bets, odds, come bets on numbers, props). */
export const totalOnTable = (bets) => {
  if (!bets) return 0;
  let total = 0;
  ['passLine', 'dontPass', 'come', 'dontCome', 'field', 'odds', 'dontPassOdds', 'big6', 'big8', 'anySeven', 'anyCraps']
    .forEach((k) => { total += bets[k] || 0; });
  Object.values(bets.place || {}).forEach((v) => { total += v || 0; });
  Object.values(bets.hardways || {}).forEach((v) => { total += v || 0; });
  Object.values(bets.horn || {}).forEach((v) => { total += v || 0; });
  Object.values(bets.comeNumbers || {}).forEach((c) => { total += (c.amount || 0) + (c.odds || 0); });
  Object.values(bets.dontComeNumbers || {}).forEach((c) => { total += (c.amount || 0) + (c.odds || 0); });
  return total;
};

/* ------------------------------------------------------------------ */
/* Spots (the tappable places on the layout)                           */
/* ------------------------------------------------------------------ */

export const SPOT_IDS = [
  'passLine', 'dontPass', 'odds', 'dontPassOdds', 'come', 'dontCome', 'field', 'big6', 'big8',
  ...POINTS.map((n) => `place${n}`),
  ...POINTS.map((n) => `comeNum${n}`),
  ...POINTS.map((n) => `dontComeNum${n}`),
  ...HARD_NUMBERS.map((n) => `hard${n}`),
  'anySeven', 'anyCraps',
  ...HORN_NUMBERS.map((n) => `horn${n}`),
];

export const SPOT_LABELS = {
  passLine: 'Pass line',
  dontPass: "Don't pass bar",
  odds: 'Pass line odds',
  dontPassOdds: "Don't pass lay odds",
  come: 'Come',
  dontCome: "Don't come bar",
  field: 'Field',
  big6: 'Big 6',
  big8: 'Big 8',
  anySeven: 'Any seven',
  anyCraps: 'Any craps',
  horn2: 'Two, aces',
  horn3: 'Three, ace deuce',
  horn11: 'Eleven, yo',
  horn12: 'Twelve, boxcars',
};

export const spotLabel = (id) => {
  if (SPOT_LABELS[id]) return SPOT_LABELS[id];
  const m = /^(place|comeNum|dontComeNum|hard)(\d+)$/.exec(id);
  if (!m) return id;
  const n = m[2];
  if (m[1] === 'place') return `Place ${n}`;
  if (m[1] === 'comeNum') return `Come bet on ${n}`;
  if (m[1] === 'dontComeNum') return `Don't come bet on ${n}`;
  return `Hard ${n}`;
};

/**
 * Translate a spot id into the engine's (betType, number) form. A tap on a spot places a
 * chip with this betType. comeNum / dontComeNum spots take odds (the flat bet arrives by
 * travelling from the come box).
 */
export const parseSpot = (id) => {
  const m = /^(place|comeNum|dontComeNum|hard|horn)(\d+)$/.exec(id);
  if (!m) return { betType: id, number: null };
  const number = Number(m[2]);
  const betType = { place: 'place', comeNum: 'comeOdds', dontComeNum: 'dontComeOdds', hard: 'hardway', horn: 'horn' }[m[1]];
  return { betType, number };
};

/** Amount on a spot (flat + odds for come-number spots). */
export const spotAmount = (bets, id) => {
  if (!bets) return 0;
  const m = /^(place|comeNum|dontComeNum|hard|horn)(\d+)$/.exec(id);
  if (!m) return bets[id] || 0;
  const n = Number(m[2]);
  switch (m[1]) {
    case 'place': return bets.place?.[n] || 0;
    case 'hard': return bets.hardways?.[n] || 0;
    case 'horn': return bets.horn?.[n] || 0;
    case 'comeNum': return (bets.comeNumbers?.[n]?.amount || 0) + (bets.comeNumbers?.[n]?.odds || 0);
    default: return (bets.dontComeNumbers?.[n]?.amount || 0) + (bets.dontComeNumbers?.[n]?.odds || 0);
  }
};

const FLAT_MIN_SPOTS = new Set(['passLine', 'dontPass', 'come', 'dontCome', 'field', 'big6', 'big8']);
const isFlatMin = (id) => FLAT_MIN_SPOTS.has(id) || id.startsWith('place');

export const maxPassOdds = (point, flat) => (point ? flat * ODDS_MULTIPLE[point] : 0);
export const maxLayOdds = (flat) => flat * LAY_MULTIPLE;

/** Odds payout (winnings only) for odds behind a point at true odds. */
export const oddsWin = (point, amount) => ratioPay(amount, TRUE_ODDS_RATIO[point]);
export const layWin = (point, amount) => ratioPay(amount, LAY_RATIO[point]);

/* ------------------------------------------------------------------ */
/* Roll summary (calm words for the UI)                                */
/* ------------------------------------------------------------------ */

const NUMBER_WORDS = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve' };
export const numberWord = (n) => NUMBER_WORDS[n] || String(n);

/**
 * Short headline for a roll: "Seven out", "Point is 6", "Yo, 11", "Craps 3", "Hard 8".
 * `r` is the object returned by CrapsEngine.roll().
 */
export const summarizeRoll = (r) => {
  if (!r?.roll) return { title: '', kind: 'none' };
  const { die1, die2, total } = r.roll;
  const hard = die1 === die2 && HARD_NUMBERS.includes(total);
  if (r.event === 'sevenOut') return { title: 'Seven out', kind: 'sevenOut' };
  if (r.event === 'pointMade') return { title: hard ? `Point made, hard ${total}` : `Point made, ${total}`, kind: 'pointMade' };
  if (r.event === 'pointEstablished') return { title: `Point is ${total}`, kind: 'pointSet' };
  if (total === 7) return { title: 'Seven, natural', kind: 'natural' };
  if (total === 11) return { title: 'Yo, 11', kind: 'yo' };
  if ([2, 3, 12].includes(total)) return { title: `Craps ${total}`, kind: 'craps' };
  if (hard) return { title: `Hard ${total}`, kind: 'hard' };
  if (HARD_NUMBERS.includes(total)) return { title: `Easy ${total}`, kind: 'easy' };
  return { title: numberWord(total), kind: 'number' };
};

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const withNet = (o) => {
  const payout = o.payout ?? 0;
  const amount = o.amount ?? 0;
  const stays = !!o.stays;
  const money = o.result === 'win' || o.result === 'lose' || o.result === 'push';
  return { ...o, payout, stays, net: money ? payout - (stays ? 0 : amount) : 0 };
};

export class CrapsEngine {
  constructor() {
    this.serverSeed = null;
    this.clientSeed = null;
    this.nonce = 0;
    this.phase = 'comeOut'; // 'comeOut' or 'point'
    this.point = null;
    this.puckPosition = null; // null or 4, 5, 6, 8, 9, 10
    this.bets = createEmptyBets();
    this.lastRoll = null;
    this.rollHistory = [];
  }

  async initialize() {
    this.serverSeed = generateSeed();
    this.clientSeed = generateSeed();
    this.nonce = 0;
    this.phase = 'comeOut';
    this.point = null;
    this.puckPosition = null;
    this.lastRoll = null;
    this.rollHistory = [];
  }

  /* ---------------- rolling ---------------- */

  /**
   * Roll the dice (provably fair) and resolve every bet. `forced` ({die1, die2}) is for
   * tests and development tooling only.
   */
  async roll(forced = null) {
    const phaseBefore = this.phase;
    const pointBefore = this.point;
    const before = cloneBets(this.bets);

    let result;
    if (forced) {
      result = { die1: forced.die1, die2: forced.die2, total: forced.die1 + forced.die2 };
    } else {
      result = await generateDiceRoll(this.serverSeed, this.clientSeed, this.nonce);
    }
    this.nonce++;
    this.lastRoll = result;

    const outcomes = this.evaluateRoll(result.total, result.die1, result.die2);

    const event = outcomes.find((o) => o.event === 'sevenOut') ? 'sevenOut'
      : outcomes.find((o) => o.event === 'pointMade') ? 'pointMade'
        : outcomes.find((o) => o.event === 'pointEstablished') ? 'pointEstablished'
          : null;

    this.rollHistory.push({ ...result, event, phase: phaseBefore, point: pointBefore });

    const resolved = outcomes.filter((o) => o.result === 'win' || o.result === 'lose' || o.result === 'push');
    const payout = resolved.reduce((s, o) => s + (o.payout || 0), 0);
    const stakeResolved = resolved.reduce((s, o) => s + (o.stays ? 0 : o.amount || 0), 0);

    return {
      roll: result,
      outcomes,
      event,
      phase: this.phase,
      point: this.point,
      puckPosition: this.puckPosition,
      phaseBefore,
      pointBefore,
      before,
      resolved,
      /** Cash returned to the wallet by this roll. */
      payout,
      /** Stake that left the table on this roll. */
      bet: stakeResolved,
      /** Profit (+) or loss (−) on this roll. */
      net: payout - stakeResolved,
    };
  }

  evaluateRoll(total, die1, die2) {
    const outcomes = [];

    // Capture phase before evaluation (the line-bet evaluators may change it)
    const phaseAtRoll = this.phase;

    if (phaseAtRoll === 'comeOut') outcomes.push(...this.evaluateComeOutRoll(total));
    else outcomes.push(...this.evaluatePointRoll(total));

    outcomes.push(...this.evaluateComeBets(total, phaseAtRoll));
    outcomes.push(...this.evaluateFieldBet(total));
    outcomes.push(...this.evaluatePlaceBets(total, phaseAtRoll));
    outcomes.push(...this.evaluateBigBets(total));
    outcomes.push(...this.evaluateHardways(total, die1, die2, phaseAtRoll));
    outcomes.push(...this.evaluateOneRollBets(total));

    return outcomes;
  }

  evaluateComeOutRoll(total) {
    const outcomes = [];
    const b = this.bets;

    if (b.passLine > 0) {
      if (total === 7 || total === 11) {
        outcomes.push(withNet({ bet: 'passLine', result: 'win', amount: b.passLine, payout: b.passLine * 2, message: total === 7 ? 'Seven, pass line wins' : 'Yo, pass line wins' }));
        b.passLine = 0;
      } else if (total === 2 || total === 3 || total === 12) {
        outcomes.push(withNet({ bet: 'passLine', result: 'lose', amount: b.passLine, payout: 0, message: 'Craps, pass line loses' }));
        b.passLine = 0;
      } else {
        outcomes.push({ bet: 'passLine', result: 'pointEstablished', point: total, amount: b.passLine, message: `Point is ${total}` });
      }
    }

    if (b.dontPass > 0) {
      if (total === 2 || total === 3) {
        outcomes.push(withNet({ bet: 'dontPass', result: 'win', amount: b.dontPass, payout: b.dontPass * 2, message: "Don't pass wins" }));
        b.dontPass = 0;
      } else if (total === 7 || total === 11) {
        outcomes.push(withNet({ bet: 'dontPass', result: 'lose', amount: b.dontPass, payout: 0, message: "Don't pass loses" }));
        b.dontPass = 0;
      } else if (total === 12) {
        // Bar 12: no win, no loss. The stake is handed back.
        outcomes.push(withNet({ bet: 'dontPass', result: 'push', amount: b.dontPass, payout: b.dontPass, message: 'Push on 12' }));
        b.dontPass = 0;
      }
    }

    // The shooter's point is established whether or not anyone bet the line.
    if (POINTS.includes(total)) {
      this.point = total;
      this.phase = 'point';
      this.puckPosition = total;
      outcomes.push({ event: 'pointEstablished', point: total });
    }

    return outcomes;
  }

  evaluatePointRoll(total) {
    const outcomes = [];
    const b = this.bets;

    if (total === 7) {
      if (b.passLine > 0) {
        outcomes.push(withNet({ bet: 'passLine', result: 'lose', amount: b.passLine, payout: 0, message: 'Seven out' }));
        b.passLine = 0;
      }
      if (b.odds > 0) {
        outcomes.push(withNet({ bet: 'odds', result: 'lose', amount: b.odds, payout: 0 }));
        b.odds = 0;
      }
      if (b.dontPass > 0) {
        outcomes.push(withNet({ bet: 'dontPass', result: 'win', amount: b.dontPass, payout: b.dontPass * 2, message: "Don't pass wins" }));
        b.dontPass = 0;
      }
      if (b.dontPassOdds > 0) {
        const win = layWin(this.point, b.dontPassOdds);
        outcomes.push(withNet({ bet: 'dontPassOdds', result: 'win', amount: b.dontPassOdds, payout: b.dontPassOdds + win }));
        b.dontPassOdds = 0;
      }

      // Every come bet on a number loses (flat and odds: odds are working in the point phase)
      POINTS.forEach((n) => {
        const c = b.comeNumbers[n];
        if (c.amount > 0) {
          outcomes.push(withNet({ bet: `come${n}`, result: 'lose', amount: c.amount, payout: 0, number: n }));
          if (c.odds > 0) outcomes.push(withNet({ bet: `comeOdds${n}`, result: 'lose', amount: c.odds, payout: 0, number: n }));
          c.amount = 0;
          c.odds = 0;
        }
      });

      this.phase = 'comeOut';
      this.point = null;
      this.puckPosition = null;
      outcomes.push({ event: 'sevenOut' });
    } else if (total === this.point) {
      const point = this.point;
      if (b.passLine > 0) {
        outcomes.push(withNet({ bet: 'passLine', result: 'win', amount: b.passLine, payout: b.passLine * 2, message: `Point ${total} made` }));
        b.passLine = 0;
      }
      if (b.odds > 0) {
        const win = oddsWin(point, b.odds);
        outcomes.push(withNet({ bet: 'odds', result: 'win', amount: b.odds, payout: b.odds + win }));
        b.odds = 0;
      }
      if (b.dontPass > 0) {
        outcomes.push(withNet({ bet: 'dontPass', result: 'lose', amount: b.dontPass, payout: 0 }));
        b.dontPass = 0;
      }
      if (b.dontPassOdds > 0) {
        outcomes.push(withNet({ bet: 'dontPassOdds', result: 'lose', amount: b.dontPassOdds, payout: 0 }));
        b.dontPassOdds = 0;
      }

      this.phase = 'comeOut';
      this.point = null;
      this.puckPosition = null;
      outcomes.push({ event: 'pointMade', point });
    }

    return outcomes;
  }

  /**
   * Come / don't come, including their travelling bets. `phaseAtRoll` matters for odds:
   * come and lay odds are off on a come-out roll (returned instead of won or lost).
   */
  evaluateComeBets(total, phaseAtRoll = 'point') {
    const outcomes = [];
    const b = this.bets;
    const oddsWorking = phaseAtRoll === 'point';

    // 1. Bets already travelling (evaluated before a new come bet moves to a number, so a
    //    bet that arrives this roll can never win on the roll it arrived).
    POINTS.forEach((n) => {
      const c = b.comeNumbers[n];
      if (c.amount <= 0) return;
      if (total === n) {
        outcomes.push(withNet({ bet: `come${n}`, result: 'win', amount: c.amount, payout: c.amount * 2, number: n, message: `Come bet on ${n} wins` }));
        if (c.odds > 0) {
          if (oddsWorking) outcomes.push(withNet({ bet: `comeOdds${n}`, result: 'win', amount: c.odds, payout: c.odds + oddsWin(n, c.odds), number: n }));
          else outcomes.push(withNet({ bet: `comeOdds${n}`, result: 'push', amount: c.odds, payout: c.odds, number: n }));
        }
        c.amount = 0;
        c.odds = 0;
      } else if (total === 7) {
        // Only reachable on a come-out 7 (a point-phase 7 was resolved with the line bets).
        outcomes.push(withNet({ bet: `come${n}`, result: 'lose', amount: c.amount, payout: 0, number: n }));
        if (c.odds > 0) {
          if (oddsWorking) outcomes.push(withNet({ bet: `comeOdds${n}`, result: 'lose', amount: c.odds, payout: 0, number: n }));
          else outcomes.push(withNet({ bet: `comeOdds${n}`, result: 'push', amount: c.odds, payout: c.odds, number: n }));
        }
        c.amount = 0;
        c.odds = 0;
      }
    });

    POINTS.forEach((n) => {
      const d = b.dontComeNumbers[n];
      if (d.amount <= 0) return;
      if (total === 7) {
        outcomes.push(withNet({ bet: `dontCome${n}`, result: 'win', amount: d.amount, payout: d.amount * 2, number: n, message: `Don't come on ${n} wins` }));
        if (d.odds > 0) {
          if (oddsWorking) outcomes.push(withNet({ bet: `dontComeOdds${n}`, result: 'win', amount: d.odds, payout: d.odds + layWin(n, d.odds), number: n }));
          else outcomes.push(withNet({ bet: `dontComeOdds${n}`, result: 'push', amount: d.odds, payout: d.odds, number: n }));
        }
        d.amount = 0;
        d.odds = 0;
      } else if (total === n) {
        outcomes.push(withNet({ bet: `dontCome${n}`, result: 'lose', amount: d.amount, payout: 0, number: n, message: `Don't come on ${n} loses` }));
        if (d.odds > 0) {
          if (oddsWorking) outcomes.push(withNet({ bet: `dontComeOdds${n}`, result: 'lose', amount: d.odds, payout: 0, number: n }));
          else outcomes.push(withNet({ bet: `dontComeOdds${n}`, result: 'push', amount: d.odds, payout: d.odds, number: n }));
        }
        d.amount = 0;
        d.odds = 0;
      }
    });

    // 2. The come box
    if (b.come > 0) {
      if (total === 7 || total === 11) {
        outcomes.push(withNet({ bet: 'come', result: 'win', amount: b.come, payout: b.come * 2, message: 'Come wins' }));
        b.come = 0;
      } else if (total === 2 || total === 3 || total === 12) {
        outcomes.push(withNet({ bet: 'come', result: 'lose', amount: b.come, payout: 0, message: 'Come loses on craps' }));
        b.come = 0;
      } else if (POINTS.includes(total)) {
        b.comeNumbers[total].amount += b.come;
        outcomes.push({ bet: 'come', result: 'moved', amount: b.come, toNumber: total, message: `Come bet moves to ${total}` });
        b.come = 0;
      }
    }

    if (b.dontCome > 0) {
      if (total === 2 || total === 3) {
        outcomes.push(withNet({ bet: 'dontCome', result: 'win', amount: b.dontCome, payout: b.dontCome * 2, message: "Don't come wins" }));
        b.dontCome = 0;
      } else if (total === 7 || total === 11) {
        outcomes.push(withNet({ bet: 'dontCome', result: 'lose', amount: b.dontCome, payout: 0, message: "Don't come loses" }));
        b.dontCome = 0;
      } else if (total === 12) {
        outcomes.push(withNet({ bet: 'dontCome', result: 'push', amount: b.dontCome, payout: b.dontCome, message: "Don't come pushes on 12" }));
        b.dontCome = 0;
      } else if (POINTS.includes(total)) {
        b.dontComeNumbers[total].amount += b.dontCome;
        outcomes.push({ bet: 'dontCome', result: 'moved', amount: b.dontCome, toNumber: total, message: `Don't come moves to ${total}` });
        b.dontCome = 0;
      }
    }

    return outcomes;
  }

  evaluateFieldBet(total) {
    const outcomes = [];
    const b = this.bets;
    if (b.field > 0) {
      if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
        // 1:1, and 2:1 on both the 2 and the 12 (the table's documented choice)
        const mult = total === 2 || total === 12 ? 3 : 2;
        outcomes.push(withNet({ bet: 'field', result: 'win', amount: b.field, payout: b.field * mult, message: mult === 3 ? 'Field pays double' : 'Field wins' }));
      } else {
        outcomes.push(withNet({ bet: 'field', result: 'lose', amount: b.field, payout: 0 }));
      }
      b.field = 0;
    }
    return outcomes;
  }

  /** Place bets are OFF on the come-out roll; they stay up after a win; a point-phase 7 clears them. */
  evaluatePlaceBets(total, phaseAtRoll = 'point') {
    const outcomes = [];
    const b = this.bets;
    if (phaseAtRoll !== 'point') return outcomes;

    if (b.place[total] > 0) {
      const amount = b.place[total];
      outcomes.push(withNet({ bet: `place${total}`, result: 'win', amount, payout: this.calculatePlacePayout(total, amount), stays: true, number: total, message: `Place ${total} wins` }));
    }

    if (total === 7) {
      POINTS.forEach((n) => {
        if (b.place[n] > 0) {
          outcomes.push(withNet({ bet: `place${n}`, result: 'lose', amount: b.place[n], payout: 0, number: n }));
          b.place[n] = 0;
        }
      });
    }
    return outcomes;
  }

  /** Big 6 / Big 8: even money, always working, lose on any 7, stay up after a win. */
  evaluateBigBets(total) {
    const outcomes = [];
    const b = this.bets;
    [6, 8].forEach((n) => {
      const key = `big${n}`;
      if (b[key] <= 0) return;
      if (total === n) {
        outcomes.push(withNet({ bet: key, result: 'win', amount: b[key], payout: b[key], stays: true, message: `Big ${n} wins` }));
      } else if (total === 7) {
        outcomes.push(withNet({ bet: key, result: 'lose', amount: b[key], payout: 0 }));
        b[key] = 0;
      }
    });
    return outcomes;
  }

  /** Hardways are OFF on the come-out roll; they stay up after a win; easy way or a 7 loses. */
  evaluateHardways(total, die1, die2, phaseAtRoll = 'point') {
    const outcomes = [];
    const b = this.bets;
    if (phaseAtRoll !== 'point') return outcomes;
    const isHard = die1 === die2;

    if (HARD_NUMBERS.includes(total) && b.hardways[total] > 0) {
      const amount = b.hardways[total];
      if (isHard) {
        outcomes.push(withNet({ bet: `hard${total}`, result: 'win', amount, payout: amount * HARDWAY_PAYS[total], stays: true, message: `Hard ${total} wins` }));
      } else {
        outcomes.push(withNet({ bet: `hard${total}`, result: 'lose', amount, payout: 0, message: `Hard ${total} loses, easy way` }));
        b.hardways[total] = 0;
      }
    }

    if (total === 7) {
      HARD_NUMBERS.forEach((n) => {
        if (b.hardways[n] > 0) {
          outcomes.push(withNet({ bet: `hard${n}`, result: 'lose', amount: b.hardways[n], payout: 0 }));
          b.hardways[n] = 0;
        }
      });
    }
    return outcomes;
  }

  evaluateOneRollBets(total) {
    const outcomes = [];
    const b = this.bets;

    if (b.anySeven > 0) {
      if (total === 7) outcomes.push(withNet({ bet: 'anySeven', result: 'win', amount: b.anySeven, payout: b.anySeven * (ANY_SEVEN_PAYS + 1), message: 'Any seven wins' }));
      else outcomes.push(withNet({ bet: 'anySeven', result: 'lose', amount: b.anySeven, payout: 0 }));
      b.anySeven = 0;
    }

    if (b.anyCraps > 0) {
      if ([2, 3, 12].includes(total)) outcomes.push(withNet({ bet: 'anyCraps', result: 'win', amount: b.anyCraps, payout: b.anyCraps * (ANY_CRAPS_PAYS + 1), message: 'Any craps wins' }));
      else outcomes.push(withNet({ bet: 'anyCraps', result: 'lose', amount: b.anyCraps, payout: 0 }));
      b.anyCraps = 0;
    }

    HORN_NUMBERS.forEach((n) => {
      const amount = b.horn[n];
      if (amount > 0) {
        if (total === n) outcomes.push(withNet({ bet: `horn${n}`, result: 'win', amount, payout: amount * (HORN_PAYS[n] + 1), message: `${numberWord(n)} wins` }));
        else outcomes.push(withNet({ bet: `horn${n}`, result: 'lose', amount, payout: 0 }));
        b.horn[n] = 0;
      }
    });

    return outcomes;
  }

  calculatePlacePayout(number, betAmount) {
    return ratioPay(betAmount, PLACE_RATIO[number]);
  }

  /** Winnings (not including the stake) of true odds on `point`. */
  calculateOddsPayout(point, betAmount) {
    return oddsWin(point, betAmount);
  }

  calculateLayPayout(point, betAmount) {
    return layWin(point, betAmount);
  }

  /* ---------------- betting ---------------- */

  canPlaceBet(betType) {
    if ((betType === 'passLine' || betType === 'dontPass') && this.phase !== 'comeOut') return false;
    if (['odds', 'dontPassOdds', 'come', 'dontCome'].includes(betType) && this.phase !== 'point') return false;
    return true;
  }

  /** Why a bet can't be placed right now, or null if it can. Pure check, no mutation. */
  validateBet(betType, amount, number = null) {
    if (!Number.isInteger(amount) || amount <= 0) return 'Enter a whole-dollar bet';
    const b = this.bets;

    if (!this.canPlaceBet(betType)) {
      if (betType === 'passLine' || betType === 'dontPass') return 'Line bets are placed on the come-out roll';
      if (betType === 'come' || betType === 'dontCome') return 'Come bets are placed after a point is set';
      return 'Odds are available once a point is set';
    }

    const capped = (current) => (current + amount > TABLE_LIMITS.max ? `Table maximum is $${TABLE_LIMITS.max}` : null);

    switch (betType) {
      case 'passLine': case 'dontPass': case 'come': case 'dontCome': case 'field': case 'big6': case 'big8':
      case 'anySeven': case 'anyCraps':
        return capped(b[betType] || 0);
      case 'place':
        if (!POINTS.includes(number)) return 'Pick a number to place';
        return capped(b.place[number]);
      case 'hardway':
        if (!HARD_NUMBERS.includes(number)) return 'Hardways are 4, 6, 8 and 10';
        return capped(b.hardways[number]);
      case 'horn':
        if (!HORN_NUMBERS.includes(number)) return 'Horn numbers are 2, 3, 11 and 12';
        return capped(b.horn[number]);
      case 'odds': {
        if (b.passLine <= 0) return 'Place a pass line bet first';
        const max = maxPassOdds(this.point, b.passLine);
        if (b.odds + amount > max) return `Maximum odds are $${max} (${ODDS_MULTIPLE[this.point]}x)`;
        return null;
      }
      case 'dontPassOdds': {
        if (b.dontPass <= 0) return "Place a don't pass bet first";
        const max = maxLayOdds(b.dontPass);
        if (b.dontPassOdds + amount > max) return `Maximum lay odds are $${max}`;
        return null;
      }
      case 'comeOdds': {
        const c = b.comeNumbers[number];
        if (!c || c.amount <= 0) return `No come bet on ${number}`;
        const max = maxPassOdds(number, c.amount);
        if (c.odds + amount > max) return `Maximum odds are $${max} (${ODDS_MULTIPLE[number]}x)`;
        return null;
      }
      case 'dontComeOdds': {
        const d = b.dontComeNumbers[number];
        if (!d || d.amount <= 0) return `No don't come bet on ${number}`;
        const max = maxLayOdds(d.amount);
        if (d.odds + amount > max) return `Maximum lay odds are $${max}`;
        return null;
      }
      default:
        return `Unknown bet: ${betType}`;
    }
  }

  /**
   * Place `amount` on a bet. Returns { success, error? }. `force` skips validation and is
   * used to restore bets that were just taken down.
   */
  placeBet(betType, amount, number = null, { force = false } = {}) {
    if (!force) {
      const error = this.validateBet(betType, amount, number);
      if (error) return { success: false, error };
    }
    const b = this.bets;
    if (betType === 'place' && number) b.place[number] = (b.place[number] || 0) + amount;
    else if (betType === 'comeOdds' && number) b.comeNumbers[number].odds += amount;
    else if (betType === 'dontComeOdds' && number) b.dontComeNumbers[number].odds += amount;
    else if (betType === 'comeNumber' && number) b.comeNumbers[number].amount += amount; // restore only
    else if (betType === 'dontComeNumber' && number) b.dontComeNumbers[number].amount += amount; // restore only
    else if (betType === 'hardway' && number) b.hardways[number] = (b.hardways[number] || 0) + amount;
    else if (betType === 'horn' && number) b.horn[number] = (b.horn[number] || 0) + amount;
    else b[betType] = (b[betType] || 0) + amount;
    return { success: true };
  }

  /** Take back part of a bet (used by Undo). Never touches a locked bet. */
  reduceBet(betType, amount, number = null) {
    const b = this.bets;
    const take = (cur) => Math.min(cur, amount);
    let taken = 0;
    if (betType === 'place' && number) { taken = take(b.place[number]); b.place[number] -= taken; }
    else if (betType === 'comeOdds' && number) { taken = take(b.comeNumbers[number].odds); b.comeNumbers[number].odds -= taken; }
    else if (betType === 'dontComeOdds' && number) { taken = take(b.dontComeNumbers[number].odds); b.dontComeNumbers[number].odds -= taken; }
    else if (betType === 'hardway' && number) { taken = take(b.hardways[number]); b.hardways[number] -= taken; }
    else if (betType === 'horn' && number) { taken = take(b.horn[number]); b.horn[number] -= taken; }
    else if (betType in b && typeof b[betType] === 'number') { taken = take(b[betType]); b[betType] -= taken; }
    return taken;
  }

  /** Is this bet a contract bet right now? Returns a reason string, or null when removable. */
  lockReason(betType, number = null) {
    const b = this.bets;
    if (betType === 'passLine' && this.phase === 'point' && b.passLine > 0) {
      return 'The pass line stays once a point is set';
    }
    if ((betType === 'comeNumber') && number && b.comeNumbers[number]?.amount > 0) {
      return 'A come bet stays until it wins or loses';
    }
    return null;
  }

  /**
   * Take a bet down and return the amount refunded. Locked (contract) bets return 0:
   * check lockReason() first when you need the reason.
   */
  removeBet(betType, number = null) {
    if (this.lockReason(betType, number)) return 0;
    const b = this.bets;
    let amount = 0;
    if (betType === 'place' && number) { amount = b.place[number]; b.place[number] = 0; }
    else if (betType === 'comeOdds' && number) { amount = b.comeNumbers[number].odds; b.comeNumbers[number].odds = 0; }
    else if (betType === 'comeNumber') { return 0; }
    else if (betType === 'dontComeNumber' && number) {
      const d = b.dontComeNumbers[number];
      amount = d.amount + d.odds;
      d.amount = 0;
      d.odds = 0;
    } else if (betType === 'dontComeOdds' && number) { amount = b.dontComeNumbers[number].odds; b.dontComeNumbers[number].odds = 0; }
    else if (betType === 'hardway' && number) { amount = b.hardways[number] || 0; b.hardways[number] = 0; }
    else if (betType === 'horn' && number) { amount = b.horn[number] || 0; b.horn[number] = 0; }
    else { amount = b[betType] || 0; b[betType] = 0; }
    return amount || 0;
  }

  /** Spot-level removal rules for the UI. */
  canRemoveSpot(spotId) {
    const b = this.bets;
    if (spotAmount(b, spotId) <= 0) return { ok: false, reason: null };
    if (spotId === 'passLine') {
      const reason = this.lockReason('passLine');
      if (reason) return { ok: false, locked: true, reason };
    }
    const m = /^comeNum(\d+)$/.exec(spotId);
    if (m && b.comeNumbers[Number(m[1])].odds <= 0) {
      return { ok: false, locked: true, reason: 'A come bet stays until it wins or loses' };
    }
    return { ok: true };
  }

  /**
   * Take down the bet on a spot. Returns { refund, placements } where `placements` can be
   * replayed through placeBet(..., { force: true }) to put the bet back (Undo).
   */
  removeSpot(spotId) {
    const check = this.canRemoveSpot(spotId);
    if (!check.ok) return { refund: 0, placements: [], ...check };
    const b = this.bets;
    const m = /^(comeNum|dontComeNum)(\d+)$/.exec(spotId);
    if (m) {
      const n = Number(m[2]);
      if (m[1] === 'comeNum') {
        const odds = b.comeNumbers[n].odds;
        b.comeNumbers[n].odds = 0;
        return { refund: odds, placements: [{ betType: 'comeOdds', number: n, amount: odds, spot: spotId }] };
      }
      const d = b.dontComeNumbers[n];
      const placements = [];
      if (d.amount > 0) placements.push({ betType: 'dontComeNumber', number: n, amount: d.amount, spot: spotId });
      if (d.odds > 0) placements.push({ betType: 'dontComeOdds', number: n, amount: d.odds, spot: spotId });
      const refund = d.amount + d.odds;
      d.amount = 0;
      d.odds = 0;
      return { refund, placements };
    }
    const { betType, number } = parseSpot(spotId);
    const refund = this.removeBet(betType, number);
    return { refund, placements: refund > 0 ? [{ betType, number, amount: refund, spot: spotId }] : [] };
  }

  /** Take down every bet that may be taken down. Returns { refund, placements }. */
  clearRemovable() {
    let refund = 0;
    const placements = [];
    SPOT_IDS.forEach((id) => {
      const r = this.removeSpot(id);
      refund += r.refund || 0;
      placements.push(...(r.placements || []));
    });
    return { refund, placements };
  }

  /** The first reason the table can't roll right now, or null. */
  validateRoll() {
    if (totalOnTable(this.bets) <= 0) return 'Place a bet to roll';
    for (const id of SPOT_IDS) {
      if (!isFlatMin(id)) continue;
      const amt = spotAmount(this.bets, id);
      if (amt > 0 && amt < TABLE_LIMITS.min) return `${spotLabel(id)} needs at least $${TABLE_LIMITS.min}`;
    }
    return null;
  }

  /** Snapshot of how much sits on each spot, for "rebet". */
  spotAmounts() {
    const out = {};
    SPOT_IDS.forEach((id) => {
      if (id.startsWith('comeNum') || id.startsWith('dontComeNum')) return;
      const a = spotAmount(this.bets, id);
      if (a > 0) out[id] = a;
    });
    return out;
  }

  getGameState() {
    return {
      phase: this.phase,
      point: this.point,
      puckPosition: this.puckPosition,
      bets: cloneBets(this.bets),
      lastRoll: this.lastRoll,
      rollHistory: this.rollHistory.slice(),
      nonce: this.nonce,
    };
  }

  resetBets() {
    const oldBets = cloneBets(this.bets);
    this.bets = createEmptyBets();
    return oldBets;
  }
}

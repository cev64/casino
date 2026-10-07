/**
 * Blackjack engine (Las Vegas Strip style rules, 6 decks).
 *
 *  - Dealer stands on soft 17, peeks for blackjack under an Ace or a ten.
 *  - Blackjack pays 3:2. A 21 made after a split is not a blackjack (pays 1:1).
 *  - Double on any first two cards, including after a split.
 *  - Split equal ranks, up to four hands. Split aces take one card each, no re-split, no hit.
 *  - Insurance (half the bet, pays 2:1) when the dealer shows an Ace; even money when the player
 *    holds a blackjack against that Ace.
 *  - Late surrender: forfeit half, first decision on the first two cards, never after a split.
 *  - The cut card sits at 75% penetration; a reshuffle only ever happens between rounds.
 *
 * The engine never touches the wallet. `BlackjackSession` (bottom of this file) wraps an engine and
 * a wallet/history adapter so that every stake and every payout is accounted for in one place.
 */

import { generateShuffledDeck, generateSeed } from '../utils/provablyFair';

export const RULES = Object.freeze({
  decks: 6,
  shoeCards: 312,
  cutCard: 78, // reshuffle between rounds once fewer cards than this remain (75% dealt)
  dealerStandsOnSoft17: true,
  dealerPeeks: true,
  blackjackPays: 1.5,
  insurancePays: 2,
  doubleAfterSplit: true,
  maxHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  lateSurrender: true,
});

/** The sentence printed on the felt, derived from the actual rules in force. */
export const rulesPrint = (rules = RULES) => {
  const pays = rules.blackjackPays === 1.5 ? '3 TO 2' : rules.blackjackPays === 1.2 ? '6 TO 5' : '1 TO 1';
  return `BLACKJACK PAYS ${pays} · DEALER STANDS ON SOFT 17`;
};

const round2 = (n) => Math.round(n * 100) / 100;
const isTen = (card) => !!card && card.value === 10;
const isAce = (card) => !!card && card.rank === 'A';
const freshFlags = () => ({ doubled: false, fromSplit: false, splitAces: false, surrendered: false, done: false });

export class BlackjackEngine {
  constructor() {
    this.shoe = [];
    this.serverSeed = null;
    this.clientSeed = null;
    this.nonce = 0;
    this.dealerHand = [];
    this.playerHands = [[]]; // more than one entry after splits
    this.handBets = [0]; // per-hand stake
    this.handFlags = [freshFlags()];
    this.currentHandIndex = 0;
    this.gameState = 'betting'; // betting, dealing, insurance, player-turn, dealer-turn, finished
    this.bet = 0; // sum of hand stakes (insurance not included)
    this.insuranceBet = 0;
    this.result = null;
    this.reshuffled = false; // the last startHand() cut and reshuffled the shoe
    this.shufflePromise = null;
  }

  async initialize() {
    this.serverSeed = generateSeed();
    this.clientSeed = generateSeed();
    this.nonce = 0;
    await this.shuffleShoe();
  }

  async shuffleShoe() {
    this.shufflePromise = generateShuffledDeck(this.serverSeed, this.clientSeed, this.nonce);
    this.shoe = await this.shufflePromise;
    this.shufflePromise = null;
    this.nonce += this.shoe.length; // fresh nonce range for the next shuffle
  }

  /** Cut card reached: fewer than 78 of 312 cards left. Checked between rounds only. */
  shouldReshuffle() {
    return this.shoe.length < RULES.cutCard;
  }

  async dealCard(faceDown = false) {
    if (this.shufflePromise) await this.shufflePromise;
    if (this.shoe.length === 0) await this.shuffleShoe(); // safety net, not expected mid-round
    const card = this.shoe.pop();
    card.faceDown = faceDown;
    return card;
  }

  // ---------------------------------------------------------------------------------------------
  // Round start
  // ---------------------------------------------------------------------------------------------

  async startHand(betAmount) {
    this.reshuffled = false;
    if (this.shouldReshuffle()) {
      await this.shuffleShoe();
      this.reshuffled = true;
    }

    this.bet = betAmount;
    this.dealerHand = [];
    this.playerHands = [[]];
    this.handBets = [betAmount];
    this.handFlags = [freshFlags()];
    this.insuranceBet = 0;
    this.currentHandIndex = 0;
    this.gameState = 'dealing';
    this.result = null;

    // Player, dealer up, player, dealer hole (face down)
    this.playerHands[0].push(await this.dealCard());
    this.dealerHand.push(await this.dealCard());
    this.playerHands[0].push(await this.dealCard());
    this.dealerHand.push(await this.dealCard(true));

    if (isAce(this.dealerHand[0])) {
      this.gameState = 'insurance'; // waiting for Yes / No (or even money)
      return this.getGameState();
    }

    this.afterInsurance();
    return this.getGameState();
  }

  /** Dealer peek for a ten or Ace up, then the player's natural, otherwise play begins. */
  afterInsurance() {
    const up = this.dealerHand[0];
    if (RULES.dealerPeeks && (isAce(up) || isTen(up)) && this.isNatural(this.dealerHand)) {
      this.determineWinner();
      return;
    }
    if (this.isNatural(this.playerHands[0], 0)) {
      this.determineWinner();
      return;
    }
    this.gameState = 'player-turn';
  }

  /** Amount to stake for insurance (half the first-hand bet). */
  insuranceCost() {
    return round2(this.handBets[0] / 2);
  }

  canInsure() {
    return this.gameState === 'insurance' && this.insuranceBet === 0;
  }

  /** True when the player holds a natural against a dealer Ace (insurance becomes even money). */
  evenMoneyOffered() {
    return this.gameState === 'insurance' && this.isNatural(this.playerHands[0], 0);
  }

  /**
   * Answer the insurance prompt. With a player blackjack, `take` means even money: the hand is paid
   * 1:1 immediately. Otherwise `take` places the side bet (stake must already be withdrawn).
   */
  async takeInsurance(take) {
    if (this.gameState !== 'insurance') return this.getGameState();

    if (take && this.evenMoneyOffered()) {
      this.settleEvenMoney();
      return this.getGameState();
    }
    if (take) this.insuranceBet = this.insuranceCost();
    this.afterInsurance();
    return this.getGameState();
  }

  settleEvenMoney() {
    this.revealAll();
    const bet = this.handBets[0];
    const payout = round2(bet * 2);
    this.gameState = 'finished';
    this.result = {
      outcome: 'win',
      evenMoney: true,
      payout,
      bet,
      net: round2(payout - bet),
      handResults: [{ hand: 0, outcome: 'win', payout, bet, evenMoney: true }],
      insurance: null,
      dealerValue: this.getHandValue(this.dealerHand),
      dealerBust: false,
      dealerBlackjack: this.isNatural(this.dealerHand),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------------------------------------

  async hit() {
    if (!this.canHit()) return this.getGameState();

    const hand = this.playerHands[this.currentHandIndex];
    hand.push(await this.dealCard());

    const value = this.getHandValue(hand);
    if (value > 21 || value === 21) {
      this.markDone(this.currentHandIndex);
      await this.advance();
    }
    return this.getGameState();
  }

  async stand() {
    if (this.gameState !== 'player-turn') return this.getGameState();
    this.markDone(this.currentHandIndex);
    await this.advance();
    return this.getGameState();
  }

  async doubleDown(faceDown = true) {
    if (!this.canDoubleDown()) return this.getGameState();

    const i = this.currentHandIndex;
    this.handBets[i] = round2(this.handBets[i] * 2);
    this.bet = round2(this.handBets.reduce((sum, b) => sum + b, 0));
    this.flags(i).doubled = true;

    this.playerHands[i].push(await this.dealCard(faceDown));
    this.markDone(i);
    await this.advance();
    return this.getGameState();
  }

  async split() {
    if (!this.canSplit()) return this.getGameState();

    const i = this.currentHandIndex;
    const hand = this.playerHands[i];
    const stake = this.handBets[i];
    const aces = isAce(hand[0]);

    const second = [hand.pop()];
    this.playerHands.splice(i + 1, 0, second);
    this.handBets.splice(i + 1, 0, stake);
    this.handFlags.splice(i + 1, 0, freshFlags());
    this.bet = round2(this.handBets.reduce((sum, b) => sum + b, 0));

    for (const idx of [i, i + 1]) {
      const f = this.flags(idx);
      f.fromSplit = true;
      f.splitAces = aces;
    }

    hand.push(await this.dealCard());
    second.push(await this.dealCard());

    if (aces) {
      // One card each, no further action
      this.markDone(i);
      this.markDone(i + 1);
    } else if (this.getHandValue(hand) === 21) {
      this.markDone(i);
    }
    if (this.isHandComplete(i)) await this.advance();
    return this.getGameState();
  }

  async surrender() {
    if (!this.canSurrender()) return this.getGameState();
    this.flags(0).surrendered = true;
    this.markDone(0);
    this.revealAll();
    this.determineWinner();
    return this.getGameState();
  }

  // ---------------------------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------------------------

  flags(i) {
    if (!this.handFlags[i]) this.handFlags[i] = freshFlags();
    return this.handFlags[i];
  }

  markDone(i) {
    this.flags(i).done = true;
  }

  isHandComplete(i) {
    const hand = this.playerHands[i];
    return this.flags(i).done || this.getHandValue(hand) >= 21;
  }

  /** Move to the next hand that still needs a decision, or let the dealer play. */
  async advance() {
    let next = this.currentHandIndex + 1;
    while (next < this.playerHands.length && this.isHandComplete(next)) next++;
    if (next < this.playerHands.length) {
      this.currentHandIndex = next;
      return;
    }

    const live = this.playerHands.some((hand, i) => this.getHandValue(hand) <= 21 && !this.flags(i).surrendered);
    if (live) {
      await this.playDealerHand();
    } else {
      this.revealAll();
      this.determineWinner(); // every hand is bust: the dealer does not draw
    }
  }

  async playDealerHand() {
    this.gameState = 'dealer-turn';
    this.revealAll();
    while (this.shouldDealerHit()) {
      this.dealerHand.push(await this.dealCard());
    }
    this.determineWinner();
    return this.getGameState();
  }

  shouldDealerHit() {
    // Stands on every 17, soft or hard.
    return this.getHandValue(this.dealerHand) < 17;
  }

  revealAll() {
    for (const c of this.dealerHand) c.faceDown = false;
    for (const hand of this.playerHands) for (const c of hand) c.faceDown = false;
  }

  checkAllHandsBust() {
    const allBust = this.playerHands.every((hand) => this.getHandValue(hand) > 21);
    if (allBust) this.determineWinner();
  }

  // ---------------------------------------------------------------------------------------------
  // Settlement
  // ---------------------------------------------------------------------------------------------

  /** A natural is two cards worth 21 on an unsplit hand (dealer: any two-card 21). */
  isNatural(hand, handIndex = null) {
    if (hand.length !== 2 || this.getHandValue(hand) !== 21) return false;
    if (handIndex === null) return true;
    return !this.flags(handIndex).fromSplit && this.playerHands.length === 1;
  }

  determineWinner() {
    this.revealAll();
    this.gameState = 'finished';

    const dealerValue = this.getHandValue(this.dealerHand);
    const dealerBust = dealerValue > 21;
    const dealerNatural = this.isNatural(this.dealerHand);

    let handsPayout = 0;
    const handResults = [];

    this.playerHands.forEach((hand, index) => {
      const bet = this.handBets[index];
      const flags = this.flags(index);
      const value = this.getHandValue(hand);
      const natural = this.isNatural(hand, index);
      let outcome;
      let payout;

      if (flags.surrendered) {
        outcome = 'surrender';
        payout = round2(bet / 2);
      } else if (value > 21) {
        outcome = 'bust';
        payout = 0;
      } else if (natural && dealerNatural) {
        outcome = 'push';
        payout = bet;
      } else if (natural) {
        outcome = 'blackjack';
        payout = round2(bet + bet * RULES.blackjackPays);
      } else if (dealerNatural) {
        outcome = 'lose';
        payout = 0;
      } else if (dealerBust || value > dealerValue) {
        outcome = 'win';
        payout = round2(bet * 2);
      } else if (value === dealerValue) {
        outcome = 'push';
        payout = bet;
      } else {
        outcome = 'lose';
        payout = 0;
      }

      handsPayout += payout;
      handResults.push({ hand: index, outcome, payout, bet });
    });

    handsPayout = round2(handsPayout);
    const handsBet = round2(this.handBets.reduce((sum, b) => sum + b, 0));

    // Insurance pays 2:1 when the dealer has a natural, otherwise the stake is lost.
    let insurance = null;
    if (this.insuranceBet > 0) {
      const won = dealerNatural;
      insurance = {
        bet: this.insuranceBet,
        payout: won ? round2(this.insuranceBet * (1 + RULES.insurancePays)) : 0,
        won,
      };
    }

    const payout = round2(handsPayout + (insurance ? insurance.payout : 0));
    const wagered = round2(handsBet + this.insuranceBet);

    let outcome;
    if (handResults.length === 1) {
      outcome = handResults[0].outcome;
    } else if (handResults.every((r) => r.outcome === 'bust')) {
      outcome = 'bust';
    } else {
      outcome = handsPayout > handsBet ? 'win' : handsPayout === handsBet ? 'push' : 'lose';
    }

    this.bet = handsBet;
    this.result = {
      outcome,
      payout,
      bet: wagered,
      net: round2(payout - wagered),
      handResults,
      insurance,
      dealerValue,
      dealerBust,
      dealerBlackjack: dealerNatural,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  getHandValue(hand, useAce = true) {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
        value += 11;
      } else {
        value += card.value;
      }
    }

    while (value > 21 && aces > 0 && useAce) {
      value -= 10;
      aces--;
    }

    return value;
  }

  /** True when an Ace is currently counted as 11. */
  isSoft(hand) {
    let hard = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.rank === 'A') { aces++; hard += 1; } else hard += card.value;
    }
    return aces > 0 && hard + 10 <= 21;
  }

  canHit() {
    if (this.gameState !== 'player-turn') return false;
    const f = this.flags(this.currentHandIndex);
    return !(f.splitAces && !RULES.hitSplitAces) && !f.done;
  }

  canSplit() {
    if (this.gameState !== 'player-turn') return false;
    const i = this.currentHandIndex;
    const hand = this.playerHands[i];
    const f = this.flags(i);
    if (hand.length !== 2 || hand[0].rank !== hand[1].rank) return false;
    if (this.playerHands.length >= RULES.maxHands) return false;
    if (f.splitAces && !RULES.resplitAces) return false;
    return true;
  }

  canDoubleDown() {
    if (this.gameState !== 'player-turn') return false;
    const i = this.currentHandIndex;
    const f = this.flags(i);
    if (this.playerHands[i].length !== 2) return false;
    if (f.splitAces) return false;
    if (f.fromSplit && !RULES.doubleAfterSplit) return false;
    return true;
  }

  canSurrender() {
    if (!RULES.lateSurrender || this.gameState !== 'player-turn') return false;
    return this.playerHands.length === 1 && this.playerHands[0].length === 2
      && !this.flags(0).fromSplit && !this.flags(0).doubled;
  }

  getGameState() {
    return {
      dealerHand: this.dealerHand,
      playerHands: this.playerHands,
      currentHandIndex: this.currentHandIndex,
      gameState: this.gameState,
      bet: this.bet,
      handBets: [...this.handBets],
      handFlags: this.handFlags.map((f) => ({ ...f })),
      insuranceBet: this.insuranceBet,
      totalWagered: round2(this.bet + this.insuranceBet),
      result: this.result,
      canSplit: this.canSplit(),
      canDoubleDown: this.canDoubleDown(),
      canHit: this.canHit(),
      canSurrender: this.canSurrender(),
      insuranceOffered: this.gameState === 'insurance',
      evenMoneyOffered: this.evenMoneyOffered(),
      shoeSize: this.shoe.length,
      shoeTotal: RULES.shoeCards,
      penetration: Math.max(0, Math.min(1, 1 - this.shoe.length / RULES.shoeCards)),
      reshuffled: this.reshuffled,
    };
  }
}

// -------------------------------------------------------------------------------------------------
// Session: engine + wallet + history, so every stake and payout reconciles.
// -------------------------------------------------------------------------------------------------

const RESULT_NAMES = { lose: 'loss' };

/**
 * wallet:  { balance(): number, withdraw(n): { success }, deposit(n) }
 * history: { begin({ bet }), end(record) }   (both optional)
 * Payouts are deposited in `settle()`. With `deferSettle: true` the caller decides when (after the
 * reveal animation); `deal()` always settles a pending round first.
 */
export class BlackjackSession {
  constructor({ engine = new BlackjackEngine(), wallet, history = null, deferSettle = false } = {}) {
    this.engine = engine;
    this.wallet = wallet;
    this.history = history;
    this.deferSettle = deferSettle;
    this.pending = null; // finished but not yet paid out
    this.open = false; // a round has been dealt and not yet finished
    this.staked = 0; // money withdrawn for the open round (bet, doubles, splits, insurance)
    this.lastRecord = null;
  }

  initialize() {
    return this.engine.initialize();
  }

  /** Take a stake out of the wallet. */
  stake(amount) {
    if (amount <= 0) return { ok: true };
    if (this.wallet.balance() < amount) return { ok: false, error: 'Not enough balance' };
    const r = this.wallet.withdraw(amount);
    if (r && r.success === false) return { ok: false, error: 'Not enough balance' };
    this.staked = round2(this.staked + amount);
    return { ok: true };
  }

  /**
   * The page is going away (reload, tab close, unmount). A finished round is paid out and recorded
   * at once; a hand still in play can't be resumed, so every stake taken for it is returned and
   * nothing is written to history.
   */
  abandon() {
    if (this.pending) return { settled: this.settle(), refunded: 0 };
    if (!this.open) return { settled: null, refunded: 0 };
    const refunded = this.staked;
    this.open = false;
    this.staked = 0;
    if (refunded > 0) this.wallet.deposit(refunded);
    this.history?.cancel?.();
    return { settled: null, refunded };
  }

  async finishIfDone(state) {
    if (state.gameState === 'finished' && this.open) {
      this.open = false;
      this.pending = { state };
      if (!this.deferSettle) this.settle();
    }
    return state;
  }

  async deal(betAmount) {
    if (this.open) return { ok: false, error: 'Round in progress' };
    if (this.pending) this.settle();
    if (!(betAmount > 0)) return { ok: false, error: 'Place a bet' };
    const staked = this.stake(betAmount);
    if (!staked.ok) return staked;

    this.open = true;
    this.staked = round2(betAmount);
    this.history?.begin?.({ bet: betAmount });
    const state = await this.engine.startHand(betAmount);
    await this.finishIfDone(state);
    return { ok: true, state };
  }

  async act(name, cost, run) {
    const engine = this.engine;
    if (!engine[name]()) return { ok: false, error: 'Not available' };
    const staked = this.stake(cost);
    if (!staked.ok) return staked;
    const state = await run();
    await this.finishIfDone(state);
    return { ok: true, state };
  }

  hit() {
    return this.act('canHit', 0, () => this.engine.hit());
  }

  async stand() {
    if (this.engine.gameState !== 'player-turn') return { ok: false, error: 'Not available' };
    const state = await this.engine.stand();
    await this.finishIfDone(state);
    return { ok: true, state };
  }

  double(faceDown = true) {
    const cost = this.engine.handBets[this.engine.currentHandIndex] || 0;
    return this.act('canDoubleDown', cost, () => this.engine.doubleDown(faceDown));
  }

  split() {
    const cost = this.engine.handBets[this.engine.currentHandIndex] || 0;
    return this.act('canSplit', cost, () => this.engine.split());
  }

  surrender() {
    return this.act('canSurrender', 0, () => this.engine.surrender());
  }

  /** Answer the insurance prompt (Insurance? Yes / No, or Even money when offered). */
  async insurance(take) {
    const engine = this.engine;
    if (engine.gameState !== 'insurance') return { ok: false, error: 'Not available' };
    const even = take && engine.evenMoneyOffered();
    if (take && !even) {
      const staked = this.stake(engine.insuranceCost());
      if (!staked.ok) return staked;
    }
    const state = await engine.takeInsurance(take);
    await this.finishIfDone(state);
    return { ok: true, state };
  }

  /** Pay out a finished round and write one history record. Safe to call more than once. */
  settle() {
    if (!this.pending) return null;
    const { state } = this.pending;
    this.pending = null;

    const result = state.result;
    if (result.payout > 0) this.wallet.deposit(result.payout);

    const d = (c) => ({ rank: c.rank, suit: c.suit });
    const record = {
      type: 'blackjack',
      bet: result.bet,
      payout: result.payout,
      netWin: result.net,
      result: result.net === 0 && result.outcome === 'lose' ? 'push' : (RESULT_NAMES[result.outcome] || result.outcome),
      hands: state.playerHands.map((cards, i) => ({
        cards: cards.map(d),
        bet: result.handResults[i]?.bet ?? state.handBets[i],
        outcome: RESULT_NAMES[result.handResults[i]?.outcome] || result.handResults[i]?.outcome,
        payout: result.handResults[i]?.payout ?? 0,
        doubled: !!state.handFlags[i]?.doubled,
      })),
      dealer: { cards: state.dealerHand.map(d), value: result.dealerValue, blackjack: result.dealerBlackjack },
      insurance: result.insurance,
      evenMoney: !!result.evenMoney,
    };
    this.history?.end?.(record);
    this.lastRecord = record;
    return record;
  }
}

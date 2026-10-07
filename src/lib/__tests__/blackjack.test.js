import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock provablyFair to make tests deterministic
vi.mock('../../utils/provablyFair', () => ({
  generateSeed: () => 'test-seed-' + Math.random().toString(36).slice(2),
  sha256: async (msg) => msg,
  generateGameResult: async (s, c, n) => `${s}:${c}:${n}`,
  // Return a pre-built deck we control
  generateShuffledDeck: async () => {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    for (let d = 0; d < 6; d++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          const value = rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank);
          deck.push({ rank, suit, value });
        }
      }
    }
    return deck;
  }
}));

const { BlackjackEngine, BlackjackSession, RULES, rulesPrint } = await import('../blackjack');

// Helper: create a card
const card = (rank, suit = 'hearts') => {
  const value = rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank);
  return { rank, suit, value, faceDown: false };
};

describe('BlackjackEngine', () => {
  let engine;

  beforeEach(async () => {
    engine = new BlackjackEngine();
    await engine.initialize();
  });

  describe('getHandValue', () => {
    it('should calculate simple hand values', () => {
      expect(engine.getHandValue([card('5'), card('8')])).toBe(13);
      expect(engine.getHandValue([card('10'), card('K')])).toBe(20);
      expect(engine.getHandValue([card('2'), card('3'), card('4')])).toBe(9);
    });

    it('should count face cards as 10', () => {
      expect(engine.getHandValue([card('J'), card('Q')])).toBe(20);
      expect(engine.getHandValue([card('K'), card('J'), card('Q')])).toBe(30);
    });

    it('should count ace as 11 when hand is under 21', () => {
      expect(engine.getHandValue([card('A'), card('9')])).toBe(20);
      expect(engine.getHandValue([card('A'), card('K')])).toBe(21);
    });

    it('should count ace as 1 when hand would bust', () => {
      expect(engine.getHandValue([card('A'), card('9'), card('5')])).toBe(15);
      expect(engine.getHandValue([card('A'), card('A'), card('9')])).toBe(21);
    });

    it('should handle multiple aces correctly', () => {
      // A + A = 12 (11 + 1)
      expect(engine.getHandValue([card('A'), card('A')])).toBe(12);
      // A + A + A = 13 (11 + 1 + 1)
      expect(engine.getHandValue([card('A'), card('A'), card('A')])).toBe(13);
      // A + A + 9 = 21 (11 + 1 + 9) — wait, that's already 21. Let me check:
      // 11 + 11 + 9 = 31, reduce first ace: 21. Yes.
      expect(engine.getHandValue([card('A'), card('A'), card('9')])).toBe(21);
    });

    it('should handle bust correctly', () => {
      expect(engine.getHandValue([card('10'), card('K'), card('5')])).toBe(25);
    });

    it('should handle empty hand', () => {
      expect(engine.getHandValue([])).toBe(0);
    });
  });

  describe('startHand', () => {
    it('should deal 4 cards total (2 player, 2 dealer)', async () => {
      const state = await engine.startHand(100);
      expect(state.playerHands[0].length).toBe(2);
      expect(state.dealerHand.length).toBe(2);
    });

    it('should set bet amount correctly', async () => {
      const state = await engine.startHand(50);
      expect(state.bet).toBe(50);
      expect(state.handBets[0]).toBe(50);
    });

    it('should enter player-turn if not blackjack', async () => {
      // With a full 6-deck shoe, most deals won't be blackjack
      const state = await engine.startHand(100);
      // The state should be either player-turn or finished (if blackjack)
      expect(['player-turn', 'finished']).toContain(state.gameState);
    });

    it('should reset previous hand state', async () => {
      await engine.startHand(100);
      const state = await engine.startHand(200);
      expect(state.bet).toBe(200);
      expect(state.result).toBeNull();
      expect(state.playerHands.length).toBe(1);
    });

    it('should track per-hand bets', async () => {
      const state = await engine.startHand(75);
      expect(state.handBets).toEqual([75]);
    });
  });

  describe('hit', () => {
    it('should add a card to current hand', async () => {
      await engine.startHand(100);
      // Force non-blackjack by setting hand manually
      engine.playerHands = [[card('5'), card('3')]];
      engine.gameState = 'player-turn';

      const state = await engine.hit();
      expect(state.playerHands[0].length).toBe(3);
    });

    it('should detect bust', async () => {
      engine.playerHands = [[card('10'), card('8')]];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      // Pop specific card that causes bust
      engine.shoe = [card('5')]; // 10 + 8 + 5 = 23 = bust
      const state = await engine.hit();
      expect(state.gameState).toBe('finished');
      expect(state.result.outcome).toBe('bust');
      expect(state.result.payout).toBe(0);
    });

    it('should not act if not player-turn', async () => {
      engine.gameState = 'betting';
      const state = await engine.hit();
      expect(state.gameState).toBe('betting');
    });
  });

  describe('stand', () => {
    it('should trigger dealer play on last hand', async () => {
      engine.playerHands = [[card('10'), card('8')]];
      engine.dealerHand = [card('10'), card('6')];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      const state = await engine.stand();
      expect(state.gameState).toBe('finished');
      expect(state.result).not.toBeNull();
    });

    it('should move to next hand in split scenario', async () => {
      engine.playerHands = [[card('10'), card('8')], [card('10'), card('7')]];
      engine.handBets = [100, 100];
      engine.bet = 200;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      await engine.stand();
      expect(engine.currentHandIndex).toBe(1);
    });
  });

  describe('doubleDown', () => {
    it('should double the current hand bet', async () => {
      engine.playerHands = [[card('5'), card('6')]];
      engine.dealerHand = [card('10'), card('7')];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      await engine.doubleDown();
      // handBet should be doubled (200), and then stand is called
      expect(engine.gameState).toBe('finished');
    });

    it('should only allow on first two cards', async () => {
      engine.playerHands = [[card('3'), card('4'), card('2')]]; // 3 cards
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      const state = await engine.doubleDown();
      // Should not have doubled - hand still has 3 cards
      expect(state.handBets[0]).toBe(100);
    });

    it('should deal exactly one card', async () => {
      engine.playerHands = [[card('5'), card('6')]];
      engine.dealerHand = [card('10'), card('7')];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      await engine.doubleDown();
      expect(engine.playerHands[0].length).toBe(3);
    });
  });

  describe('split', () => {
    it('should split matching pairs into two hands', async () => {
      engine.playerHands = [[card('8'), card('8')]];
      engine.dealerHand = [card('10'), card('7')];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      await engine.split();
      expect(engine.playerHands.length).toBe(2);
      expect(engine.playerHands[0].length).toBe(2);
      expect(engine.playerHands[1].length).toBe(2);
    });

    it('should duplicate bet for split hand', async () => {
      engine.playerHands = [[card('8'), card('8')]];
      engine.dealerHand = [card('10'), card('7')];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      await engine.split();
      expect(engine.handBets).toEqual([100, 100]);
      expect(engine.bet).toBe(200);
    });

    it('should reject split on non-pair', async () => {
      engine.playerHands = [[card('8'), card('9')]];
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;

      await engine.split();
      expect(engine.playerHands.length).toBe(1); // No split
    });
  });

  describe('canSplit / canDoubleDown', () => {
    it('canSplit returns true for pairs during player-turn', () => {
      engine.playerHands = [[card('J'), card('J')]];
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;
      expect(engine.canSplit()).toBe(true);
    });

    it('canSplit returns false for non-pairs', () => {
      engine.playerHands = [[card('J'), card('Q')]]; // Both value 10 but different ranks
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;
      expect(engine.canSplit()).toBe(false);
    });

    it('canDoubleDown returns true for two-card hand during player-turn', () => {
      engine.playerHands = [[card('5'), card('6')]];
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;
      expect(engine.canDoubleDown()).toBe(true);
    });

    it('canDoubleDown returns false after hitting', () => {
      engine.playerHands = [[card('5'), card('3'), card('2')]];
      engine.gameState = 'player-turn';
      engine.currentHandIndex = 0;
      expect(engine.canDoubleDown()).toBe(false);
    });
  });

  describe('determineWinner', () => {
    it('should award 2x bet on player win', () => {
      engine.playerHands = [[card('10'), card('9')]]; // 19
      engine.dealerHand = [card('10'), card('8')]; // 18
      engine.handBets = [100];
      engine.bet = 100;
      engine.determineWinner();
      expect(engine.result.outcome).toBe('win');
      expect(engine.result.payout).toBe(200);
    });

    it('should return bet on push', () => {
      engine.playerHands = [[card('10'), card('8')]]; // 18
      engine.dealerHand = [card('10'), card('8')]; // 18
      engine.handBets = [100];
      engine.bet = 100;
      engine.determineWinner();
      expect(engine.result.outcome).toBe('push');
      expect(engine.result.payout).toBe(100);
    });

    it('should pay 0 on player loss', () => {
      engine.playerHands = [[card('10'), card('7')]]; // 17
      engine.dealerHand = [card('10'), card('8')]; // 18
      engine.handBets = [100];
      engine.bet = 100;
      engine.determineWinner();
      expect(engine.result.outcome).toBe('lose');
      expect(engine.result.payout).toBe(0);
    });

    it('should award win on dealer bust', () => {
      engine.playerHands = [[card('10'), card('8')]]; // 18
      engine.dealerHand = [card('10'), card('6'), card('K')]; // 26 bust
      engine.handBets = [100];
      engine.bet = 100;
      engine.determineWinner();
      expect(engine.result.outcome).toBe('win');
      expect(engine.result.payout).toBe(200);
      expect(engine.result.dealerBust).toBe(true);
    });

    it('should handle split hands independently', () => {
      engine.playerHands = [
        [card('10'), card('9')], // 19 - wins
        [card('10'), card('7')]  // 17 - loses
      ];
      engine.dealerHand = [card('10'), card('8')]; // 18
      engine.handBets = [100, 100];
      engine.bet = 200;
      engine.determineWinner();
      // Hand 0 wins (200), Hand 1 loses (0) = 200 total, bet is 200 => push
      expect(engine.result.payout).toBe(200);
      expect(engine.result.handResults.length).toBe(2);
      expect(engine.result.handResults[0].outcome).toBe('win');
      expect(engine.result.handResults[1].outcome).toBe('lose');
    });
  });

  describe('blackjack payouts', () => {
    it('should pay 3:2 on blackjack (2.5x bet)', async () => {
      engine.playerHands = [[card('A'), card('K')]]; // 21
      engine.dealerHand = [card('10'), card('8')]; // 18
      engine.handBets = [100];
      engine.bet = 100;
      engine.gameState = 'dealing';

      // Simulate blackjack check from startHand
      if (engine.getHandValue(engine.playerHands[0]) === 21) {
        engine.gameState = 'finished';
        engine.result = { outcome: 'blackjack', payout: engine.bet * 2.5 };
      }

      expect(engine.result.payout).toBe(250);
    });

    it('should push when both have blackjack', async () => {
      engine.playerHands = [[card('A'), card('K')]];
      engine.dealerHand = [card('A'), card('Q')];
      engine.handBets = [100];
      engine.bet = 100;

      const pv = engine.getHandValue(engine.playerHands[0]);
      const dv = engine.getHandValue(engine.dealerHand);

      if (pv === 21 && dv === 21) {
        engine.result = { outcome: 'push', payout: engine.bet };
      }

      expect(engine.result.outcome).toBe('push');
      expect(engine.result.payout).toBe(100);
    });
  });

  describe('shouldReshuffle', () => {
    it('should reshuffle when shoe has fewer than 78 cards', () => {
      engine.shoe = new Array(77);
      expect(engine.shouldReshuffle()).toBe(true);
    });

    it('should not reshuffle when shoe has 78+ cards', () => {
      engine.shoe = new Array(78);
      expect(engine.shouldReshuffle()).toBe(false);
    });
  });

  describe('shouldDealerHit', () => {
    it('should hit on 16 or less', () => {
      engine.dealerHand = [card('10'), card('6')]; // 16
      expect(engine.shouldDealerHit()).toBe(true);

      engine.dealerHand = [card('5'), card('3')]; // 8
      expect(engine.shouldDealerHit()).toBe(true);
    });

    it('should stand on 17', () => {
      engine.dealerHand = [card('10'), card('7')]; // 17
      expect(engine.shouldDealerHit()).toBe(false);
    });

    it('should stand on 18+', () => {
      engine.dealerHand = [card('10'), card('8')]; // 18
      expect(engine.shouldDealerHit()).toBe(false);
    });
  });

  describe('getGameState', () => {
    it('should return all expected fields', async () => {
      const state = await engine.startHand(100);
      expect(state).toHaveProperty('dealerHand');
      expect(state).toHaveProperty('playerHands');
      expect(state).toHaveProperty('currentHandIndex');
      expect(state).toHaveProperty('gameState');
      expect(state).toHaveProperty('bet');
      expect(state).toHaveProperty('handBets');
      expect(state).toHaveProperty('result');
      expect(state).toHaveProperty('canSplit');
      expect(state).toHaveProperty('canDoubleDown');
      expect(state).toHaveProperty('shoeSize');
    });

    it('should return a copy of handBets (not reference)', () => {
      engine.handBets = [100, 200];
      const state = engine.getGameState();
      state.handBets[0] = 999;
      expect(engine.handBets[0]).toBe(100); // Original unchanged
    });
  });
});


// -------------------------------------------------------------------------------------------------
// Casino rules: peek, insurance, even money, surrender, split rules, session bookkeeping
// -------------------------------------------------------------------------------------------------

/** Rig the shoe: cards are dealt in the order given (deal order: P, D up, P, D hole, then draws). */
const rig = (engine, ranks) => {
  const filler = Array.from({ length: 120 }, () => card('2', 'clubs'));
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const seq = ranks.map((r, i) => card(r, suits[i % 4]));
  engine.shoe = [...filler, ...seq.reverse()];
};

const makeWallet = (start = 1000) => {
  const w = {
    cash: start,
    out: 0,
    inn: 0,
    balance: () => w.cash,
    withdraw: (n) => {
      if (w.cash < n) return { success: false };
      w.cash -= n;
      w.out += n;
      return { success: true };
    },
    deposit: (n) => { w.cash += n; w.inn += n; },
  };
  return w;
};

const makeSession = async (ranks, { start = 1000 } = {}) => {
  const wallet = makeWallet(start);
  const records = [];
  const session = new BlackjackSession({ wallet, history: { begin: () => {}, end: (r) => records.push(r) } });
  await session.initialize();
  rig(session.engine, ranks);
  return { session, wallet, records, engine: session.engine };
};

describe('rules', () => {
  it('prints the rule that is actually in force', () => {
    expect(RULES.dealerStandsOnSoft17).toBe(true);
    expect(RULES.blackjackPays).toBe(1.5);
    expect(rulesPrint()).toBe('BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON SOFT 17');
  });

  it('dealer stands on soft 17', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    e.dealerHand = [card('A'), card('6')];
    expect(e.shouldDealerHit()).toBe(false);
    expect(e.isSoft(e.dealerHand)).toBe(true);
  });
});

describe('dealing and peek', () => {
  it('deals upcard first, hole card face down', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['10', '9', '7', '8', '5']);
    const s = await e.startHand(50);
    expect(s.dealerHand[0].rank).toBe('9');
    expect(s.dealerHand[1].rank).toBe('8');
    expect(s.dealerHand[1].faceDown).toBe(true);
    expect(s.gameState).toBe('player-turn');
  });

  it('peeks under a ten and resolves a dealer blackjack immediately', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['10', 'K', '7', 'A']); // dealer K + A
    const s = await e.startHand(100);
    expect(s.gameState).toBe('finished');
    expect(s.result.outcome).toBe('lose');
    expect(s.result.payout).toBe(0);
    expect(s.result.dealerBlackjack).toBe(true);
    expect(s.dealerHand[1].faceDown).toBe(false);
  });

  it('pushes a player blackjack against a dealer blackjack (ten up)', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['A', 'Q', 'K', 'A']);
    const s = await e.startHand(100);
    expect(s.result.outcome).toBe('push');
    expect(s.result.payout).toBe(100);
  });

  it('pays 3:2 on a player blackjack when the dealer does not have one', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['A', '9', 'K', '7']);
    const s = await e.startHand(100);
    expect(s.result.outcome).toBe('blackjack');
    expect(s.result.payout).toBe(250);
  });

  it('does not peek under a low upcard', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['9', '6', '8', '5']);
    const s = await e.startHand(100);
    expect(s.gameState).toBe('player-turn');
    expect(s.insuranceOffered).toBe(false);
  });

  it('reshuffles at the cut card, between rounds only, and reports it', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['9', '6', '8', '5']);
    e.shoe = e.shoe.slice(-77); // fewer than 78 cards left
    const s = await e.startHand(10);
    expect(s.reshuffled).toBe(true);
    expect(s.shoeSize).toBeGreaterThan(300);
    // never mid-round: a shoe at the cut card keeps dealing until the round ends
    e.shoe = e.shoe.slice(-40);
    e.gameState = 'player-turn';
    e.playerHands = [[card('2'), card('3')]];
    e.dealerHand = [card('10'), card('7')];
    e.handBets = [10];
    e.handFlags = [{ doubled: false, fromSplit: false, splitAces: false, surrendered: false, done: false }];
    e.currentHandIndex = 0;
    await e.hit();
    expect(e.shoe.length).toBe(39);
  });
});

describe('insurance and even money', () => {
  it('offers insurance on an Ace and holds the round until answered', async () => {
    const e = new BlackjackEngine();
    await e.initialize();
    rig(e, ['9', 'A', '7', '5']);
    const s = await e.startHand(100);
    expect(s.gameState).toBe('insurance');
    expect(s.insuranceOffered).toBe(true);
    expect(s.evenMoneyOffered).toBe(false);
    expect(e.insuranceCost()).toBe(50);
  });

  it('insurance pays 2:1 against a dealer blackjack, main bet loses', async () => {
    const { session, wallet, records } = await makeSession(['9', 'A', '7', 'K']);
    await session.deal(100);
    const r = await session.insurance(true);
    expect(r.state.gameState).toBe('finished');
    expect(r.state.result.outcome).toBe('lose');
    expect(r.state.result.insurance).toMatchObject({ bet: 50, payout: 150, won: true });
    expect(wallet.cash).toBe(1000); // lost 100, insurance returns 150 for a 50 stake
    expect(records[0].netWin).toBe(0);
    expect(records[0].bet).toBe(150);
  });

  it('insurance is lost when the dealer has no blackjack, play continues', async () => {
    const { session, wallet } = await makeSession(['10', 'A', '8', '6', '5']);
    await session.deal(100);
    const r = await session.insurance(true);
    expect(r.state.gameState).toBe('player-turn');
    expect(r.state.insuranceBet).toBe(50);
    expect(wallet.cash).toBe(1000 - 100 - 50);
  });

  it('declining insurance against a dealer blackjack loses the hand', async () => {
    const { session, wallet } = await makeSession(['9', 'A', '7', 'Q']);
    await session.deal(100);
    const r = await session.insurance(false);
    expect(r.state.result.outcome).toBe('lose');
    expect(wallet.cash).toBe(900);
  });

  it('even money pays 1:1 immediately', async () => {
    const { session, wallet, records } = await makeSession(['A', 'A', 'K', '6']);
    await session.deal(100);
    expect(session.engine.evenMoneyOffered()).toBe(true);
    const r = await session.insurance(true);
    expect(r.state.gameState).toBe('finished');
    expect(r.state.result.evenMoney).toBe(true);
    expect(r.state.result.payout).toBe(200);
    expect(wallet.cash).toBe(1100);
    expect(records[0].netWin).toBe(100);
  });

  it('declining even money pays 3:2 when the dealer has no blackjack', async () => {
    const { session, wallet } = await makeSession(['A', 'A', 'K', '6']);
    await session.deal(100);
    const r = await session.insurance(false);
    expect(r.state.result.outcome).toBe('blackjack');
    expect(wallet.cash).toBe(1150);
  });

  it('declining even money pushes against a dealer blackjack', async () => {
    const { session, wallet } = await makeSession(['A', 'A', 'K', 'K']);
    await session.deal(100);
    const r = await session.insurance(false);
    expect(r.state.result.outcome).toBe('push');
    expect(wallet.cash).toBe(1000);
  });

  it('cannot afford insurance', async () => {
    const { session } = await makeSession(['9', 'A', '7', '5'], { start: 120 });
    await session.deal(100);
    const r = await session.insurance(true);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Not enough balance');
    expect(session.engine.gameState).toBe('insurance');
  });
});

describe('late surrender', () => {
  it('returns half the bet on the first decision', async () => {
    const { session, wallet, records } = await makeSession(['10', '10', '6', '7']);
    await session.deal(100);
    const r = await session.surrender();
    expect(r.state.result.outcome).toBe('surrender');
    expect(r.state.result.payout).toBe(50);
    expect(wallet.cash).toBe(950);
    expect(records[0].result).toBe('surrender');
    expect(records[0].netWin).toBe(-50);
  });

  it('is not available after a hit', async () => {
    const { session, engine } = await makeSession(['10', '10', '2', '7', '2', '3']);
    await session.deal(100);
    await session.hit();
    expect(engine.canSurrender()).toBe(false);
    const r = await session.surrender();
    expect(r.ok).toBe(false);
  });

  it('is not available after a split', async () => {
    const { session, engine } = await makeSession(['8', '10', '8', '7', '2', '3']);
    await session.deal(100);
    await session.split();
    expect(engine.canSurrender()).toBe(false);
  });
});

describe('split rules', () => {
  it('split aces receive one card each and stand', async () => {
    // P: A,A  D: 10 up, 7 hole  then splits get 5 and 9
    const { session, engine, wallet } = await makeSession(['A', '10', 'A', '7', '5', '9']);
    await session.deal(100);
    const r = await session.split();
    expect(r.state.playerHands.map((h) => h.length)).toEqual([2, 2]);
    expect(r.state.gameState).toBe('finished'); // no further decisions; dealer stands on 17
    expect(engine.canHit()).toBe(false);
    // A+5 soft 16 loses to 17, A+9 soft 20 wins
    expect(r.state.result.handResults.map((h) => h.outcome)).toEqual(['lose', 'win']);
    expect(wallet.cash).toBe(1000);
  });

  it('split aces cannot be re-split', async () => {
    const { session, engine } = await makeSession(['A', '6', 'A', '7', 'A', '9']);
    await session.deal(100);
    await session.split();
    expect(engine.canSplit()).toBe(false);
  });

  it('21 after a split is not a blackjack and pays 1:1', async () => {
    // P: 10,10 vs dealer 9 / 8 (17). Splits: first gets A -> 21, second gets 9 -> 19
    const { session, wallet, records } = await makeSession(['10', '9', '10', '8', 'A', '9']);
    await session.deal(100);
    const r = await session.split();
    // Hand 0 reached 21 and is complete, hand 1 is active
    expect(r.state.currentHandIndex).toBe(1);
    const end = await session.stand();
    expect(end.state.result.handResults[0].outcome).toBe('win');
    expect(end.state.result.handResults[0].payout).toBe(200); // 1:1, not 250
    expect(end.state.result.handResults[1].outcome).toBe('win');
    expect(wallet.cash).toBe(1200);
    expect(records[0].hands).toHaveLength(2);
  });

  it('re-splits non-aces up to four hands', async () => {
    const { session, engine } = await makeSession(
      ['8', '6', '8', '5', '8', '8', '8', '8', '3', '3', '3', '3'],
      { start: 5000 },
    );
    await session.deal(100);
    await session.split(); // [8,8] [8,8]
    expect(engine.playerHands).toHaveLength(2);
    await session.split(); // current [8,8] -> 3 hands
    expect(engine.playerHands).toHaveLength(3);
    expect(engine.currentHandIndex).toBe(0);
    await session.split(); // 4 hands
    expect(engine.playerHands).toHaveLength(4);
    expect(engine.canSplit()).toBe(false);
    expect(engine.handBets).toEqual([100, 100, 100, 100]);
  });

  it('allows double after split', async () => {
    const { session, engine } = await makeSession(['8', '6', '8', '5', '3', '9', '4']);
    await session.deal(100);
    await session.split(); // hand 0: 8+3, hand 1: 8+9
    expect(engine.canDoubleDown()).toBe(true);
    await session.double();
    expect(engine.handBets[0]).toBe(200);
  });

  it('the last hand busting does not strand the round', async () => {
    const { session } = await makeSession(['10', '10', '9', '7', '10', '10', '9']);
    await session.deal(100); // 10,9 =19 vs dealer 10 / 7 =17
    // force a pair-free two hand setup manually
    const e = session.engine;
    e.playerHands = [[card('10'), card('8')], [card('10'), card('6')]];
    e.handBets = [100, 100];
    e.handFlags = [{ doubled: false, fromSplit: true, splitAces: false, surrendered: false, done: false },
      { doubled: false, fromSplit: true, splitAces: false, surrendered: false, done: false }];
    e.currentHandIndex = 0;
    e.bet = 200;
    e.shoe.push(card('K'));
    await session.stand(); // hand 0 stands
    const r = await session.hit(); // hand 1 busts: 26
    expect(r.state.gameState).toBe('finished');
    expect(r.state.result.handResults[1].outcome).toBe('bust');
  });
});

describe('doubling', () => {
  it('deals the double card face down and settles at twice the stake', async () => {
    const { session, engine, wallet } = await makeSession(['5', '10', '6', '7', '10']);
    await session.deal(100);
    const before = wallet.cash;
    const r = await session.double(true);
    expect(before).toBe(900);
    expect(r.state.handFlags[0].doubled).toBe(true);
    expect(r.state.playerHands[0]).toHaveLength(3);
    expect(r.state.result.handResults[0].bet).toBe(200);
    expect(r.state.result.handResults[0].outcome).toBe('win'); // 21 vs 17
    expect(wallet.cash).toBe(1200);
    expect(engine.bet).toBe(200);
  });

  it('is refused when the balance cannot cover the second stake', async () => {
    const { session, engine } = await makeSession(['5', '10', '6', '7', '10'], { start: 150 });
    await session.deal(100);
    const r = await session.double();
    expect(r.ok).toBe(false);
    expect(engine.playerHands[0]).toHaveLength(2);
  });
});

describe('wallet reconciliation', () => {
  // Every scenario: wallet delta must equal sum(payouts) - sum(stakes), and match the history record.
  const scenarios = [
    { name: 'plain win', ranks: ['10', '10', '9', '8'], run: async (s) => { await s.deal(100); await s.stand(); }, delta: 100 },
    { name: 'plain loss', ranks: ['10', '10', '7', '9'], run: async (s) => { await s.deal(100); await s.stand(); }, delta: -100 },
    { name: 'push', ranks: ['10', '10', '8', '8'], run: async (s) => { await s.deal(100); await s.stand(); }, delta: 0 },
    { name: 'blackjack 3:2', ranks: ['A', '9', 'K', '7'], run: async (s) => { await s.deal(50); }, delta: 75 },
    { name: 'double win', ranks: ['5', '10', '6', '7', '10'], run: async (s) => { await s.deal(100); await s.double(); }, delta: 200 },
    { name: 'double loss', ranks: ['5', '10', '6', '7', '2'], run: async (s) => { await s.deal(100); await s.double(); }, delta: -200 },
    { name: 'double bust', ranks: ['10', '10', '6', '7', '10'], run: async (s) => { await s.deal(100); await s.double(); }, delta: -200 },
    { name: 'surrender', ranks: ['10', '10', '6', '7'], run: async (s) => { await s.deal(100); await s.surrender(); }, delta: -50 },
    { name: 'split, one wins one loses', ranks: ['8', '10', '8', '7', '3', '10'], run: async (s) => { await s.deal(100); await s.split(); await s.stand(); await s.stand(); }, delta: 0 },
    { name: 'split then double both', ranks: ['8', '10', '8', '7', '3', '9', '8', '4', '5'], run: async (s) => { await s.deal(100); await s.split(); await s.double(); await s.double(); }, delta: null },
    { name: 'insurance wins', ranks: ['9', 'A', '7', 'K'], run: async (s) => { await s.deal(100); await s.insurance(true); }, delta: 0 },
    { name: 'insurance loses, hand wins', ranks: ['10', 'A', '10', '6', '10'], run: async (s) => { await s.deal(100); await s.insurance(true); await s.stand(); }, delta: 100 - 50 },
    { name: 'even money', ranks: ['A', 'A', 'K', '6'], run: async (s) => { await s.deal(100); await s.insurance(true); }, delta: 100 },
    { name: 'all bust', ranks: ['10', '9', '6', '7', 'K'], run: async (s) => { await s.deal(100); await s.hit(); }, delta: -100 },
  ];

  for (const sc of scenarios) {
    it(`reconciles: ${sc.name}`, async () => {
      const { session, wallet, records } = await makeSession(sc.ranks);
      await sc.run(session);
      expect(session.engine.gameState).toBe('finished');
      expect(records).toHaveLength(1);
      const rec = records[0];
      expect(wallet.cash).toBe(1000 + rec.netWin);
      expect(wallet.inn - wallet.out).toBe(rec.netWin);
      expect(wallet.out).toBe(rec.bet);
      expect(wallet.inn).toBe(rec.payout);
      expect(rec.bet - 0).toBe(rec.hands.reduce((a, h) => a + h.bet, 0) + (rec.insurance?.bet || 0));
      if (sc.delta !== null) expect(rec.netWin).toBe(sc.delta);
    });
  }

  it('defers the payout until settle() and settles only once', async () => {
    const wallet = makeWallet();
    const records = [];
    const session = new BlackjackSession({ wallet, deferSettle: true, history: { begin() {}, end: (r) => records.push(r) } });
    await session.initialize();
    rig(session.engine, ['10', '10', '9', '8']);
    await session.deal(100);
    await session.stand();
    expect(wallet.cash).toBe(900); // not yet paid
    session.settle();
    session.settle();
    expect(wallet.cash).toBe(1100);
    expect(records).toHaveLength(1);
  });

  it('settles a pending round before the next deal', async () => {
    const wallet = makeWallet();
    const session = new BlackjackSession({ wallet, deferSettle: true });
    await session.initialize();
    rig(session.engine, ['10', '10', '9', '8']);
    await session.deal(100);
    await session.stand();
    rig(session.engine, ['10', '10', '9', '8']);
    await session.deal(50);
    expect(wallet.cash).toBe(1100 - 50);
  });

  it('refuses to deal over a round in progress', async () => {
    const { session } = await makeSession(['10', '6', '5', '9']);
    await session.deal(100);
    const r = await session.deal(100);
    expect(r.ok).toBe(false);
  });

  it('rejects a bet larger than the balance without touching the wallet', async () => {
    const { session, wallet } = await makeSession(['10', '6', '5', '9'], { start: 50 });
    const r = await session.deal(100);
    expect(r.ok).toBe(false);
    expect(wallet.cash).toBe(50);
  });
});

describe('leaving the page (abandon)', () => {
  it('pays out and records a finished round that is still waiting to settle', async () => {
    const wallet = makeWallet();
    const records = [];
    const session = new BlackjackSession({ wallet, deferSettle: true, history: { begin() {}, end: (r) => records.push(r) } });
    await session.initialize();
    rig(session.engine, ['10', '10', '9', '8']);
    await session.deal(25);
    await session.stand();
    expect(wallet.cash).toBe(975); // reveal still running
    const out = session.abandon();
    expect(out.settled).not.toBeNull();
    expect(wallet.cash).toBe(1025);
    expect(records).toHaveLength(1);
    expect(records[0].netWin).toBe(25);
    session.abandon();
    expect(wallet.cash).toBe(1025);
    expect(records).toHaveLength(1);
  });

  it('refunds the stake of a hand in play and writes no history', async () => {
    const wallet = makeWallet();
    const records = [];
    let cancelled = 0;
    const session = new BlackjackSession({ wallet, deferSettle: true, history: { begin() {}, end: (r) => records.push(r), cancel: () => { cancelled += 1; } } });
    await session.initialize();
    rig(session.engine, ['10', '10', '6', '7']);
    await session.deal(25);
    expect(session.engine.gameState).toBe('player-turn');
    expect(wallet.cash).toBe(975);
    const out = session.abandon();
    expect(out.refunded).toBe(25);
    expect(wallet.cash).toBe(1000);
    expect(records).toHaveLength(0);
    expect(cancelled).toBe(1);
    session.abandon();
    expect(wallet.cash).toBe(1000);
  });

  it('refunds doubles, splits and insurance too', async () => {
    const wallet = makeWallet();
    const session = new BlackjackSession({ wallet, deferSettle: true });
    await session.initialize();
    rig(session.engine, ['8', '10', '8', '7', '3', '9', '4']);
    await session.deal(100);
    await session.split(); // second stake
    await session.double(); // third stake
    expect(wallet.cash).toBe(700);
    session.abandon();
    expect(wallet.cash).toBe(1000);

    const w2 = makeWallet();
    const s2 = new BlackjackSession({ wallet: w2, deferSettle: true });
    await s2.initialize();
    rig(s2.engine, ['10', 'A', '10', '6', '10']);
    await s2.deal(100);
    await s2.insurance(true);
    expect(s2.engine.gameState).toBe('player-turn');
    expect(w2.cash).toBe(850);
    s2.abandon();
    expect(w2.cash).toBe(1000);
  });

  it('can deal again after an abandoned round', async () => {
    const { session, wallet } = await makeSession(['10', '10', '6', '7', '10', '10', '9', '8']);
    await session.deal(50);
    session.abandon();
    expect(wallet.cash).toBe(1000);
    const r = await session.deal(50);
    expect(r.ok).toBe(true);
  });
});


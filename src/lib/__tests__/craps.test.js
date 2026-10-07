import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock provablyFair and localStorage
vi.mock('../../utils/provablyFair', () => ({
  generateSeed: () => 'test-seed',
  generateDiceRoll: async (s, c, n) => {
    // Default: return 7 (can be overridden per test)
    return { die1: 4, die2: 3, total: 7 };
  }
}));

vi.mock('../../utils/localStorage', () => ({
  getGameHistory: () => [],
  addGameToHistory: () => true
}));

const craps = await import('../craps');
const { CrapsEngine, totalOnTable, summarizeRoll, TABLE_LIMITS } = craps;

describe('CrapsEngine', () => {
  let engine;

  beforeEach(async () => {
    engine = new CrapsEngine();
    await engine.initialize();
  });

  describe('initial state', () => {
    it('should start in comeOut phase', () => {
      expect(engine.phase).toBe('comeOut');
      expect(engine.point).toBeNull();
      expect(engine.puckPosition).toBeNull();
    });

    it('should have all bets at zero', () => {
      expect(engine.bets.passLine).toBe(0);
      expect(engine.bets.dontPass).toBe(0);
      expect(engine.bets.field).toBe(0);
      expect(engine.bets.come).toBe(0);
    });
  });

  describe('placeBet / removeBet', () => {
    it('should place flat bets correctly', () => {
      engine.placeBet('passLine', 25);
      expect(engine.bets.passLine).toBe(25);
      engine.placeBet('passLine', 10);
      expect(engine.bets.passLine).toBe(35);
    });

    it('should place place bets with number', () => {
      engine.placeBet('place', 30, 6);
      expect(engine.bets.place[6]).toBe(30);
    });

    it('should place hardway bets', () => {
      engine.placeBet('hardway', 10, 8);
      expect(engine.bets.hardways[8]).toBe(10);
    });

    it('should place horn bets', () => {
      engine.placeBet('horn', 5, 2);
      expect(engine.bets.horn[2]).toBe(5);
    });

    it('should place come odds', () => {
      engine.bets.comeNumbers[6].amount = 25;
      engine.placeBet('comeOdds', 50, 6);
      expect(engine.bets.comeNumbers[6].odds).toBe(50);
    });

    it('should remove flat bets and return amount', () => {
      engine.placeBet('passLine', 25);
      const refund = engine.removeBet('passLine');
      expect(refund).toBe(25);
      expect(engine.bets.passLine).toBe(0);
    });

    it('should remove place bets with number', () => {
      engine.placeBet('place', 30, 6);
      const refund = engine.removeBet('place', 6);
      expect(refund).toBe(30);
      expect(engine.bets.place[6]).toBe(0);
    });

    it('should remove hardway bets with number', () => {
      engine.placeBet('hardway', 10, 8);
      const refund = engine.removeBet('hardway', 8);
      expect(refund).toBe(10);
      expect(engine.bets.hardways[8]).toBe(0);
    });

    it('should remove horn bets with number', () => {
      engine.placeBet('horn', 5, 12);
      const refund = engine.removeBet('horn', 12);
      expect(refund).toBe(5);
      expect(engine.bets.horn[12]).toBe(0);
    });
  });

  describe('canPlaceBet', () => {
    it('should allow passLine only on comeOut', () => {
      expect(engine.canPlaceBet('passLine')).toBe(true);
      engine.phase = 'point';
      expect(engine.canPlaceBet('passLine')).toBe(false);
    });

    it('should allow odds only on point phase', () => {
      expect(engine.canPlaceBet('odds')).toBe(false);
      engine.phase = 'point';
      expect(engine.canPlaceBet('odds')).toBe(true);
    });

    it('should always allow field bets', () => {
      expect(engine.canPlaceBet('field')).toBe(true);
      engine.phase = 'point';
      expect(engine.canPlaceBet('field')).toBe(true);
    });
  });

  describe('come-out roll', () => {
    it('should win pass line on 7', () => {
      engine.bets.passLine = 25;
      const outcomes = engine.evaluateComeOutRoll(7);
      const passResult = outcomes.find(o => o.bet === 'passLine');
      expect(passResult.result).toBe('win');
      expect(passResult.payout).toBe(50); // 25 * 2
      expect(engine.bets.passLine).toBe(0);
    });

    it('should win pass line on 11', () => {
      engine.bets.passLine = 25;
      const outcomes = engine.evaluateComeOutRoll(11);
      const passResult = outcomes.find(o => o.bet === 'passLine');
      expect(passResult.result).toBe('win');
      expect(passResult.payout).toBe(50);
    });

    it('should lose pass line on craps (2, 3, 12)', () => {
      for (const craps of [2, 3, 12]) {
        engine.bets.passLine = 25;
        const outcomes = engine.evaluateComeOutRoll(craps);
        const passResult = outcomes.find(o => o.bet === 'passLine');
        expect(passResult.result).toBe('lose');
        expect(passResult.payout).toBe(0);
      }
    });

    it('should establish point on 4, 5, 6, 8, 9, 10', () => {
      for (const point of [4, 5, 6, 8, 9, 10]) {
        engine.phase = 'comeOut';
        engine.point = null;
        engine.bets.passLine = 25;
        const outcomes = engine.evaluateComeOutRoll(point);
        const passResult = outcomes.find(o => o.bet === 'passLine');
        expect(passResult.result).toBe('pointEstablished');
        expect(engine.point).toBe(point);
        expect(engine.phase).toBe('point');
        expect(engine.puckPosition).toBe(point);
      }
    });

    it('should win dontPass on 2 or 3', () => {
      engine.bets.dontPass = 25;
      const outcomes = engine.evaluateComeOutRoll(2);
      const result = outcomes.find(o => o.bet === 'dontPass');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(50);
    });

    it('should lose dontPass on 7 or 11', () => {
      engine.bets.dontPass = 25;
      const outcomes = engine.evaluateComeOutRoll(7);
      const result = outcomes.find(o => o.bet === 'dontPass');
      expect(result.result).toBe('lose');
    });

    it('should push dontPass on 12', () => {
      engine.bets.dontPass = 25;
      const outcomes = engine.evaluateComeOutRoll(12);
      const result = outcomes.find(o => o.bet === 'dontPass');
      expect(result.result).toBe('push');
      expect(result.payout).toBe(25);
    });
  });

  describe('point roll', () => {
    beforeEach(() => {
      engine.phase = 'point';
      engine.point = 6;
      engine.puckPosition = 6;
    });

    it('should win pass line when point is made', () => {
      engine.bets.passLine = 25;
      const outcomes = engine.evaluatePointRoll(6);
      const result = outcomes.find(o => o.bet === 'passLine');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(50);
      expect(engine.phase).toBe('comeOut');
      expect(engine.point).toBeNull();
    });

    it('should lose pass line on seven-out', () => {
      engine.bets.passLine = 25;
      const outcomes = engine.evaluatePointRoll(7);
      const result = outcomes.find(o => o.bet === 'passLine');
      expect(result.result).toBe('lose');
      expect(result.payout).toBe(0);
      expect(engine.phase).toBe('comeOut');
    });

    it('should win dontPass on seven-out', () => {
      engine.bets.dontPass = 25;
      const outcomes = engine.evaluatePointRoll(7);
      const result = outcomes.find(o => o.bet === 'dontPass');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(50);
    });

    it('should lose dontPass when point is made', () => {
      engine.bets.dontPass = 25;
      const outcomes = engine.evaluatePointRoll(6);
      const result = outcomes.find(o => o.bet === 'dontPass');
      expect(result.result).toBe('lose');
    });

    it('should pay odds at true odds on point made', () => {
      engine.bets.passLine = 25;
      engine.bets.odds = 50;
      const outcomes = engine.evaluatePointRoll(6);
      const oddsResult = outcomes.find(o => o.bet === 'odds');
      expect(oddsResult.result).toBe('win');
      // Point 6: 6:5 odds, so 50 * 1.2 = 60 winnings, payout = 50 + 60 = 110
      expect(oddsResult.payout).toBe(110);
    });

    it('should lose odds on seven-out', () => {
      engine.bets.passLine = 25;
      engine.bets.odds = 50;
      const outcomes = engine.evaluatePointRoll(7);
      const oddsResult = outcomes.find(o => o.bet === 'odds');
      expect(oddsResult.result).toBe('lose');
      expect(oddsResult.payout).toBe(0);
    });

    it('should clear all come-number bets on seven-out', () => {
      engine.bets.comeNumbers[4].amount = 25;
      engine.bets.comeNumbers[8].amount = 15;
      const outcomes = engine.evaluatePointRoll(7);
      const comeLosses = outcomes.filter(o => o.bet && o.bet.startsWith('come') && o.result === 'lose');
      expect(comeLosses.length).toBe(2);
      expect(engine.bets.comeNumbers[4].amount).toBe(0);
      expect(engine.bets.comeNumbers[8].amount).toBe(0);
    });
  });

  describe('field bets', () => {
    it('should win on field numbers (3, 4, 9, 10, 11)', () => {
      for (const num of [3, 4, 9, 10, 11]) {
        engine.bets.field = 10;
        const outcomes = engine.evaluateFieldBet(num);
        expect(outcomes[0].result).toBe('win');
        expect(outcomes[0].payout).toBe(20); // 1:1
      }
    });

    it('should pay double on 2', () => {
      engine.bets.field = 10;
      const outcomes = engine.evaluateFieldBet(2);
      expect(outcomes[0].result).toBe('win');
      expect(outcomes[0].payout).toBe(30); // 2:1
    });

    it('should pay double on 12', () => {
      engine.bets.field = 10;
      const outcomes = engine.evaluateFieldBet(12);
      expect(outcomes[0].result).toBe('win');
      expect(outcomes[0].payout).toBe(30);
    });

    it('should lose on 5, 6, 7, 8', () => {
      for (const num of [5, 6, 7, 8]) {
        engine.bets.field = 10;
        const outcomes = engine.evaluateFieldBet(num);
        expect(outcomes[0].result).toBe('lose');
        expect(outcomes[0].payout).toBe(0);
      }
    });

    it('should clear field bet after evaluation', () => {
      engine.bets.field = 10;
      engine.evaluateFieldBet(9);
      expect(engine.bets.field).toBe(0);
    });
  });

  describe('place bets', () => {
    it('should pay place bet on hit (bet stays up)', () => {
      engine.bets.place[6] = 30;
      const outcomes = engine.evaluatePlaceBets(6, 'point');
      const result = outcomes.find(o => o.bet === 'place6');
      expect(result.result).toBe('win');
      // Place 6 pays 7:6, so 30 * 7/6 = 35
      expect(result.payout).toBe(35);
      // Bet stays up
      expect(engine.bets.place[6]).toBe(30);
    });

    it('should clear all place bets on seven during point phase', () => {
      engine.bets.place[4] = 20;
      engine.bets.place[6] = 30;
      engine.bets.place[8] = 25;
      const outcomes = engine.evaluatePlaceBets(7, 'point');
      const losses = outcomes.filter(o => o.result === 'lose');
      expect(losses.length).toBe(3);
      expect(engine.bets.place[4]).toBe(0);
      expect(engine.bets.place[6]).toBe(0);
      expect(engine.bets.place[8]).toBe(0);
    });

    it('should NOT clear place bets on seven during comeOut phase', () => {
      engine.bets.place[6] = 30;
      const outcomes = engine.evaluatePlaceBets(7, 'comeOut');
      const losses = outcomes.filter(o => o.result === 'lose');
      expect(losses.length).toBe(0);
      expect(engine.bets.place[6]).toBe(30); // Still there
    });
  });

  describe('place bet payouts', () => {
    it('should pay 9:5 on 4 and 10', () => {
      expect(engine.calculatePlacePayout(4, 50)).toBe(90);  // 50 * 9/5
      expect(engine.calculatePlacePayout(10, 50)).toBe(90);
    });

    it('should pay 7:5 on 5 and 9', () => {
      expect(engine.calculatePlacePayout(5, 50)).toBe(70);  // 50 * 7/5
      expect(engine.calculatePlacePayout(9, 50)).toBe(70);
    });

    it('should pay 7:6 on 6 and 8', () => {
      expect(engine.calculatePlacePayout(6, 30)).toBe(35);  // 30 * 7/6
      expect(engine.calculatePlacePayout(8, 30)).toBe(35);
    });
  });

  describe('odds payouts (true odds)', () => {
    it('should pay 2:1 on 4 and 10', () => {
      expect(engine.calculateOddsPayout(4, 50)).toBe(100);
      expect(engine.calculateOddsPayout(10, 50)).toBe(100);
    });

    it('should pay 3:2 on 5 and 9', () => {
      expect(engine.calculateOddsPayout(5, 50)).toBe(75);
      expect(engine.calculateOddsPayout(9, 50)).toBe(75);
    });

    it('should pay 6:5 on 6 and 8', () => {
      expect(engine.calculateOddsPayout(6, 50)).toBe(60);
      expect(engine.calculateOddsPayout(8, 50)).toBe(60);
    });
  });

  describe('hardways', () => {
    it('should win hardway on hard roll', () => {
      engine.bets.hardways[8] = 10;
      const outcomes = engine.evaluateHardways(8, 4, 4); // hard 8
      const result = outcomes.find(o => o.bet === 'hard8');
      expect(result.result).toBe('win');
      // RULE CHANGE: hardways stay up after a win; payout is winnings only (10 * 9 = 90)
      expect(result.payout).toBe(90);
      expect(result.stays).toBe(true);
      expect(result.net).toBe(90);
      expect(engine.bets.hardways[8]).toBe(10);
    });

    it('should lose hardway on easy roll', () => {
      engine.bets.hardways[8] = 10;
      const outcomes = engine.evaluateHardways(8, 5, 3); // easy 8
      const result = outcomes.find(o => o.bet === 'hard8');
      expect(result.result).toBe('lose');
    });

    it('should lose all hardways on seven', () => {
      engine.bets.hardways[4] = 5;
      engine.bets.hardways[6] = 5;
      engine.bets.hardways[8] = 5;
      engine.bets.hardways[10] = 5;
      const outcomes = engine.evaluateHardways(7, 4, 3);
      expect(outcomes.filter(o => o.result === 'lose').length).toBe(4);
    });

    it('should pay 7:1 on hard 4 and hard 10', () => {
      engine.bets.hardways[4] = 10;
      const outcomes = engine.evaluateHardways(4, 2, 2);
      expect(outcomes[0].payout).toBe(70); // winnings only: 10 * 7 (bet stays up)

      engine.bets.hardways[10] = 10;
      const outcomes2 = engine.evaluateHardways(10, 5, 5);
      expect(outcomes2[0].payout).toBe(70);
    });

    it('should pay 9:1 on hard 6 and hard 8', () => {
      engine.bets.hardways[6] = 10;
      const outcomes = engine.evaluateHardways(6, 3, 3);
      expect(outcomes[0].payout).toBe(90); // winnings only: 10 * 9
    });
  });

  describe('one-roll bets', () => {
    it('should win anySeven on 7', () => {
      engine.bets.anySeven = 10;
      const outcomes = engine.evaluateOneRollBets(7);
      const result = outcomes.find(o => o.bet === 'anySeven');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(50); // 4:1
    });

    it('should lose anySeven on non-7', () => {
      engine.bets.anySeven = 10;
      const outcomes = engine.evaluateOneRollBets(8);
      expect(outcomes[0].result).toBe('lose');
    });

    it('should win anyCraps on 2, 3, 12', () => {
      for (const craps of [2, 3, 12]) {
        engine.bets.anyCraps = 10;
        const outcomes = engine.evaluateOneRollBets(craps);
        const result = outcomes.find(o => o.bet === 'anyCraps');
        expect(result.result).toBe('win');
        expect(result.payout).toBe(80); // 7:1
      }
    });

    it('should win horn 2 on 2 (pays 30:1)', () => {
      engine.bets.horn[2] = 5;
      const outcomes = engine.evaluateOneRollBets(2);
      const result = outcomes.find(o => o.bet === 'horn2');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(155); // 5 * (30+1)
    });

    it('should win horn 3 on 3 (pays 15:1)', () => {
      engine.bets.horn[3] = 5;
      const outcomes = engine.evaluateOneRollBets(3);
      const result = outcomes.find(o => o.bet === 'horn3');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(80); // 5 * (15+1)
    });

    it('should lose horn bets on wrong number', () => {
      engine.bets.horn[2] = 5;
      engine.bets.horn[12] = 5;
      const outcomes = engine.evaluateOneRollBets(7);
      expect(outcomes.every(o => o.result === 'lose')).toBe(true);
    });
  });

  describe('come bets', () => {
    it('should win come bet on 7', () => {
      engine.bets.come = 25;
      const outcomes = engine.evaluateComeBets(7);
      const result = outcomes.find(o => o.bet === 'come');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(50);
    });

    it('should win come bet on 11', () => {
      engine.bets.come = 25;
      const outcomes = engine.evaluateComeBets(11);
      const result = outcomes.find(o => o.bet === 'come');
      expect(result.result).toBe('win');
    });

    it('should lose come bet on 2, 3, 12', () => {
      for (const craps of [2, 3, 12]) {
        engine.bets.come = 25;
        const outcomes = engine.evaluateComeBets(craps);
        const result = outcomes.find(o => o.bet === 'come');
        expect(result.result).toBe('lose');
      }
    });

    it('should move come bet to number on 4-10', () => {
      engine.bets.come = 25;
      const outcomes = engine.evaluateComeBets(6);
      const result = outcomes.find(o => o.bet === 'come');
      expect(result.result).toBe('moved');
      expect(engine.bets.comeNumbers[6].amount).toBe(25);
      expect(engine.bets.come).toBe(0);
    });

    it('should win come-number bet when number hits', () => {
      engine.bets.comeNumbers[8].amount = 25;
      const outcomes = engine.evaluateComeBets(8);
      const result = outcomes.find(o => o.bet === 'come8');
      expect(result.result).toBe('win');
      expect(result.payout).toBe(50);
    });

    it('should NOT win a just-moved come bet on same roll', () => {
      // If come bet moves to 6, and the roll is 6, it shouldn't immediately win
      engine.bets.come = 25;
      const outcomes = engine.evaluateComeBets(6);
      // Should only have the 'moved' result, not a win
      const wins = outcomes.filter(o => o.result === 'win');
      expect(wins.length).toBe(0);
    });
  });

  describe('dont come bets', () => {
    it('should win dontCome on 2 or 3', () => {
      engine.bets.dontCome = 25;
      const outcomes = engine.evaluateComeBets(2);
      const result = outcomes.find(o => o.bet === 'dontCome');
      expect(result.result).toBe('win');
    });

    it('should lose dontCome on 7 or 11', () => {
      engine.bets.dontCome = 25;
      const outcomes = engine.evaluateComeBets(7);
      const result = outcomes.find(o => o.bet === 'dontCome');
      expect(result.result).toBe('lose');
    });

    it('should push dontCome on 12', () => {
      engine.bets.dontCome = 25;
      const outcomes = engine.evaluateComeBets(12);
      const result = outcomes.find(o => o.bet === 'dontCome');
      expect(result.result).toBe('push');
      expect(result.payout).toBe(25);
    });

    it('should move dontCome to number', () => {
      engine.bets.dontCome = 25;
      const outcomes = engine.evaluateComeBets(6);
      const result = outcomes.find(o => o.bet === 'dontCome');
      expect(result.result).toBe('moved');
      expect(engine.bets.dontComeNumbers[6].amount).toBe(25);
    });
  });

  describe('evaluateRoll integration (phase capture fix)', () => {
    it('should clear place bets on seven-out (phase captured before change)', () => {
      engine.phase = 'point';
      engine.point = 6;
      engine.puckPosition = 6;
      engine.bets.passLine = 25;
      engine.bets.place[8] = 30;
      engine.bets.place[4] = 20;

      const outcomes = engine.evaluateRoll(7, 4, 3);

      // Place bets should be lost (phase was 'point' when roll started)
      const place8Loss = outcomes.find(o => o.bet === 'place8' && o.result === 'lose');
      const place4Loss = outcomes.find(o => o.bet === 'place4' && o.result === 'lose');
      expect(place8Loss).toBeDefined();
      expect(place4Loss).toBeDefined();
      expect(engine.bets.place[8]).toBe(0);
      expect(engine.bets.place[4]).toBe(0);
    });
  });

  describe('resetBets', () => {
    it('should clear all bets and return old bets', () => {
      engine.bets.passLine = 25;
      engine.bets.place[6] = 30;
      engine.bets.hardways[8] = 10;
      engine.bets.horn[2] = 5;

      const old = engine.resetBets();
      expect(old.passLine).toBe(25);
      expect(old.place[6]).toBe(30);

      expect(engine.bets.passLine).toBe(0);
      expect(engine.bets.place[6]).toBe(0);
      expect(engine.bets.hardways[8]).toBe(0);
      expect(engine.bets.horn[2]).toBe(0);
    });
  });

  describe('getGameState', () => {
    it('should return a shallow clone of bets', () => {
      engine.bets.passLine = 50;
      engine.bets.place[6] = 30;
      const state = engine.getGameState();

      // Mutate state copy
      state.bets.passLine = 999;
      state.bets.place[6] = 999;

      // Original should be unchanged
      expect(engine.bets.passLine).toBe(50);
      expect(engine.bets.place[6]).toBe(30);
    });

    it('should return all expected fields', () => {
      const state = engine.getGameState();
      expect(state).toHaveProperty('phase');
      expect(state).toHaveProperty('point');
      expect(state).toHaveProperty('puckPosition');
      expect(state).toHaveProperty('bets');
      expect(state).toHaveProperty('lastRoll');
      expect(state).toHaveProperty('rollHistory');
      expect(state).toHaveProperty('nonce');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Rules added in the rebuild                                          */
  /* ------------------------------------------------------------------ */

  describe('money convention (amount / payout / stays / net)', () => {
    it('line win nets +stake, loss nets -stake, push nets 0', () => {
      engine.bets.passLine = 25;
      const win = engine.evaluateComeOutRoll(7).find(o => o.bet === 'passLine');
      expect([win.payout, win.net, win.stays]).toEqual([50, 25, false]);
      engine.bets.passLine = 25;
      const loss = engine.evaluateComeOutRoll(2).find(o => o.bet === 'passLine');
      expect([loss.payout, loss.net]).toEqual([0, -25]);
      engine.bets.dontPass = 25;
      const push = engine.evaluateComeOutRoll(12).find(o => o.bet === 'dontPass');
      expect([push.result, push.payout, push.net]).toEqual(['push', 25, 0]);
      expect(engine.bets.dontPass).toBe(0);
    });

    it('place win stays up and nets the winnings', () => {
      engine.bets.place[8] = 30;
      const r = engine.evaluatePlaceBets(8, 'point')[0];
      expect([r.payout, r.net, r.stays]).toEqual([35, 35, true]);
    });
  });

  describe('point establishment', () => {
    it('sets the point even with nothing on the table', () => {
      for (const n of [4, 5, 6, 8, 9, 10]) {
        const e = new CrapsEngine();
        e.evaluateRoll(n, 1, n - 1);
        expect(e.point).toBe(n);
        expect(e.phase).toBe('point');
      }
    });
    it('stays on the come-out for 2 3 7 11 12', () => {
      for (const n of [2, 3, 7, 11, 12]) {
        const e = new CrapsEngine();
        e.evaluateRoll(n, 1, 1);
        expect(e.phase).toBe('comeOut');
        expect(e.point).toBeNull();
      }
    });
  });

  describe('off on the come-out', () => {
    it('place bets and hardways neither win nor lose on a come-out roll', () => {
      engine.bets.place[6] = 30;
      engine.bets.hardways[8] = 10;
      expect(engine.evaluateRoll(7, 4, 3).filter(o => o.result === 'win' || o.result === 'lose')).toHaveLength(0);
      expect(engine.bets.place[6]).toBe(30);
      expect(engine.bets.hardways[8]).toBe(10);
      engine.phase = 'comeOut';
      expect(engine.evaluateRoll(6, 3, 3).filter(o => o.bet === 'place6' || o.bet === 'hard8' || o.bet === 'hard6')).toHaveLength(0);
    });
    it('work in the point phase', () => {
      engine.phase = 'point';
      engine.point = 5;
      engine.bets.place[6] = 30;
      engine.bets.hardways[6] = 10;
      const outcomes = engine.evaluateRoll(6, 3, 3);
      expect(outcomes.find(o => o.bet === 'place6').result).toBe('win');
      expect(outcomes.find(o => o.bet === 'hard6').result).toBe('win');
    });
  });

  describe('big 6 / big 8', () => {
    it('pay even money on 6 / 8 and stay up', () => {
      engine.bets.big6 = 10;
      engine.bets.big8 = 20;
      const o6 = engine.evaluateBigBets(6);
      expect(o6).toHaveLength(1);
      expect([o6[0].payout, o6[0].stays]).toEqual([10, true]);
      expect(engine.bets.big6).toBe(10);
      const o8 = engine.evaluateBigBets(8);
      expect(o8[0].payout).toBe(20);
    });
    it('lose on any 7 in either phase', () => {
      for (const phase of ['comeOut', 'point']) {
        engine.phase = phase;
        engine.bets.big6 = 10;
        const r = engine.evaluateRoll(7, 4, 3).find(o => o.bet === 'big6');
        expect(r.result).toBe('lose');
        expect(engine.bets.big6).toBe(0);
      }
    });
  });

  describe('odds', () => {
    beforeEach(() => { engine.phase = 'point'; });

    it('pays true odds behind each point', () => {
      const table = { 4: 100, 5: 75, 6: 60, 8: 60, 9: 75, 10: 100 };
      for (const [pt, win] of Object.entries(table)) {
        const e = new CrapsEngine();
        e.phase = 'point'; e.point = Number(pt);
        e.bets.passLine = 25; e.bets.odds = 50;
        const o = e.evaluateRoll(Number(pt), 1, Number(pt) - 1).find(x => x.bet === 'odds');
        expect(o.payout).toBe(50 + win);
        expect(o.net).toBe(win);
      }
    });

    it('enforces 3-4-5x on pass odds and requires a pass line bet', () => {
      engine.point = 6;
      expect(engine.placeBet('odds', 5).success).toBe(false); // no flat bet
      engine.bets.passLine = 10;
      expect(engine.placeBet('odds', 50).success).toBe(true); // 5x on 6
      expect(engine.placeBet('odds', 5).success).toBe(false);
      engine.point = 4;
      engine.bets.odds = 0;
      expect(engine.placeBet('odds', 30).success).toBe(true); // 3x on 4
      expect(engine.placeBet('odds', 1).success).toBe(false);
      engine.point = 9;
      engine.bets.odds = 0;
      expect(engine.validateBet('odds', 41)).toMatch(/Maximum odds/);
      expect(engine.validateBet('odds', 40)).toBeNull(); // 4x on 9
    });

    it('enforces the multiple on come odds', () => {
      engine.bets.comeNumbers[8].amount = 10;
      expect(engine.placeBet('comeOdds', 50, 8).success).toBe(true);
      expect(engine.placeBet('comeOdds', 1, 8).success).toBe(false);
      expect(engine.placeBet('comeOdds', 5, 5).success).toBe(false); // no come bet on 5
    });

    it('pays lay odds 1:2, 2:3, 5:6 when the seven comes', () => {
      const table = { 4: 50, 5: 40, 6: 50, 8: 50, 9: 40, 10: 50 };
      const lay = { 4: 100, 5: 60, 6: 60, 8: 60, 9: 60, 10: 100 };
      for (const pt of [4, 5, 6, 8, 9, 10]) {
        const e = new CrapsEngine();
        e.phase = 'point'; e.point = pt;
        e.bets.dontPass = 10; e.bets.dontPassOdds = lay[pt];
        const o = e.evaluateRoll(7, 4, 3).find(x => x.bet === 'dontPassOdds');
        expect(o.result).toBe('win');
        expect(o.net).toBe(table[pt]);
      }
    });

    it('caps lay odds at 6x and requires a don\'t pass bet', () => {
      expect(engine.placeBet('dontPassOdds', 5).success).toBe(false);
      engine.bets.dontPass = 10;
      expect(engine.placeBet('dontPassOdds', 60).success).toBe(true);
      expect(engine.placeBet('dontPassOdds', 1).success).toBe(false);
    });

    it('loses pass odds and lay odds correctly when the point is made', () => {
      engine.point = 6;
      engine.bets.dontPass = 10; engine.bets.dontPassOdds = 60;
      const o = engine.evaluateRoll(6, 3, 3);
      expect(o.find(x => x.bet === 'dontPassOdds').result).toBe('lose');
    });
  });

  describe('come bets on numbers', () => {
    it('come-out 7 loses flat come bets and returns their odds', () => {
      engine.bets.comeNumbers[6] = { amount: 10, odds: 25 };
      const o = engine.evaluateRoll(7, 4, 3);
      expect(o.find(x => x.bet === 'come6').result).toBe('lose');
      const odds = o.find(x => x.bet === 'comeOdds6');
      expect([odds.result, odds.payout, odds.net]).toEqual(['push', 25, 0]);
      expect(engine.bets.comeNumbers[6]).toEqual({ amount: 0, odds: 0 });
    });

    it('come odds are off on a come-out hit (flat wins, odds returned)', () => {
      engine.bets.comeNumbers[8] = { amount: 10, odds: 25 };
      const o = engine.evaluateRoll(8, 4, 4);
      expect(o.find(x => x.bet === 'come8').payout).toBe(20);
      expect(o.find(x => x.bet === 'comeOdds8').result).toBe('push');
    });

    it('come odds win at true odds in the point phase', () => {
      engine.phase = 'point'; engine.point = 5;
      engine.bets.comeNumbers[8] = { amount: 10, odds: 25 };
      const o = engine.evaluateRoll(8, 4, 4);
      expect(o.find(x => x.bet === 'comeOdds8').payout).toBe(25 + 30);
    });

    it('pays an existing come bet and moves the new one on the same number', () => {
      engine.phase = 'point'; engine.point = 5;
      engine.bets.comeNumbers[6].amount = 10;
      engine.bets.come = 20;
      const o = engine.evaluateRoll(6, 3, 3);
      expect(o.find(x => x.bet === 'come6').result).toBe('win');
      expect(o.find(x => x.bet === 'come').result).toBe('moved');
      expect(engine.bets.comeNumbers[6].amount).toBe(20);
    });

    it('don\'t come numbers pay lay odds on a 7 and are returned (off) on a come-out 7', () => {
      engine.phase = 'point'; engine.point = 5;
      engine.bets.dontComeNumbers[4] = { amount: 10, odds: 40 };
      const win = engine.evaluateRoll(7, 4, 3).filter(o => o.bet?.startsWith('dontCome'));
      expect(win.find(o => o.bet === 'dontCome4').payout).toBe(20);
      expect(win.find(o => o.bet === 'dontComeOdds4').payout).toBe(40 + 20); // 1:2
      const e = new CrapsEngine();
      e.bets.dontComeNumbers[4] = { amount: 10, odds: 40 };
      const off = e.evaluateRoll(7, 4, 3);
      expect(off.find(o => o.bet === 'dontComeOdds4').result).toBe('push');
    });
  });

  describe('field and props', () => {
    it('field pays 2:1 on both 2 and 12', () => {
      for (const n of [2, 12]) {
        engine.bets.field = 10;
        expect(engine.evaluateFieldBet(n)[0].payout).toBe(30);
      }
    });
    it('horn / any seven / any craps', () => {
      engine.bets.horn[12] = 5; engine.bets.horn[11] = 5;
      expect(engine.evaluateOneRollBets(12).find(o => o.bet === 'horn12').payout).toBe(155);
      engine.bets.horn[11] = 5;
      expect(engine.evaluateOneRollBets(11).find(o => o.bet === 'horn11').payout).toBe(80);
      engine.bets.anySeven = 5;
      expect(engine.evaluateOneRollBets(7)[0].net).toBe(20);
      engine.bets.anyCraps = 5;
      expect(engine.evaluateOneRollBets(3)[0].net).toBe(35);
    });
  });

  describe('table limits', () => {
    it('rejects totals above the maximum per spot', () => {
      expect(engine.placeBet('field', 500).success).toBe(true);
      const r = engine.placeBet('field', 5);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/\$500/);
      expect(engine.bets.field).toBe(500);
    });
    it('validateRoll reports empty tables and spots under the minimum', () => {
      expect(engine.validateRoll()).toBe('Place a bet to roll');
      engine.placeBet('passLine', 1);
      expect(engine.validateRoll()).toMatch(/at least \$5/);
      engine.placeBet('passLine', 4);
      expect(engine.validateRoll()).toBeNull();
      expect(TABLE_LIMITS.min).toBe(5);
    });
    it('props and odds may start at $1', () => {
      engine.placeBet('anySeven', 1);
      expect(engine.validateRoll()).toBeNull();
    });
    it('phase rules for line and come bets', () => {
      expect(engine.placeBet('come', 5).success).toBe(false);
      expect(engine.placeBet('dontCome', 5).success).toBe(false);
      engine.phase = 'point';
      expect(engine.placeBet('come', 5).success).toBe(true);
      expect(engine.placeBet('passLine', 5).success).toBe(false);
    });
  });

  describe('locks, removal and undo', () => {
    it('pass line is locked once a point is set', () => {
      engine.placeBet('passLine', 25);
      engine.phase = 'point'; engine.point = 6;
      expect(engine.lockReason('passLine')).toBeTruthy();
      expect(engine.removeBet('passLine')).toBe(0);
      expect(engine.canRemoveSpot('passLine')).toMatchObject({ ok: false, locked: true });
      expect(engine.bets.passLine).toBe(25);
    });
    it('come bets on numbers are locked, odds are removable', () => {
      engine.phase = 'point'; engine.point = 5;
      engine.bets.comeNumbers[6] = { amount: 10, odds: 0 };
      expect(engine.canRemoveSpot('comeNum6')).toMatchObject({ ok: false, locked: true });
      engine.bets.comeNumbers[6].odds = 20;
      const r = engine.removeSpot('comeNum6');
      expect(r.refund).toBe(20);
      expect(engine.bets.comeNumbers[6]).toEqual({ amount: 10, odds: 0 });
    });
    it('removeSpot placements replay through placeBet force', () => {
      engine.bets.dontComeNumbers[8] = { amount: 10, odds: 30 };
      engine.phase = 'point'; engine.point = 5;
      const r = engine.removeSpot('dontComeNum8');
      expect(r.refund).toBe(40);
      expect(totalOnTable(engine.bets)).toBe(0);
      r.placements.forEach(p => engine.placeBet(p.betType, p.amount, p.number, { force: true }));
      expect(engine.bets.dontComeNumbers[8]).toEqual({ amount: 10, odds: 30 });
    });
    it('clearRemovable leaves locked bets', () => {
      engine.placeBet('passLine', 25);
      engine.placeBet('field', 10);
      engine.placeBet('place', 30, 6);
      engine.phase = 'point'; engine.point = 6;
      const r = engine.clearRemovable();
      expect(r.refund).toBe(40);
      expect(engine.bets.passLine).toBe(25);
      expect(totalOnTable(engine.bets)).toBe(25);
    });
    it('reduceBet takes back part of a bet', () => {
      engine.placeBet('place', 30, 6);
      expect(engine.reduceBet('place', 10, 6)).toBe(10);
      expect(engine.bets.place[6]).toBe(20);
      expect(engine.reduceBet('place', 100, 6)).toBe(20);
    });
  });

  describe('summarizeRoll', () => {
    const sum = (die1, die2, event = null) => summarizeRoll({ roll: { die1, die2, total: die1 + die2 }, event }).title;
    it('describes rolls calmly', () => {
      expect(sum(4, 3, 'sevenOut')).toBe('Seven out');
      expect(sum(3, 3, 'pointEstablished')).toBe('Point is 6');
      expect(sum(5, 1, 'pointMade')).toBe('Point made, 6');
      expect(sum(5, 6)).toBe('Yo, 11');
      expect(sum(1, 2)).toBe('Craps 3');
      expect(sum(4, 4)).toBe('Hard 8');
      expect(sum(5, 3)).toBe('Easy 8');
    });
  });

  describe('roll(forced)', () => {
    it('returns money totals that reconcile and writes no history', async () => {
      engine.placeBet('passLine', 25);
      engine.placeBet('field', 10);
      const r = await engine.roll({ die1: 4, die2: 3 });
      expect(r.roll.total).toBe(7);
      expect(r.event).toBeNull();
      expect(r.payout - r.bet).toBe(r.net);
      expect(r.net).toBe(25 - 10);
      expect(r.before.passLine).toBe(25);
      expect(r.resolved.length).toBe(2);
    });
  });

  describe('wallet reconciliation', () => {
    const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

    const simulate = async (seed, { passLine }) => {
      const rnd = lcg(seed);
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const e = new CrapsEngine();
      const start = 100000;
      let balance = start;
      let cum = 0;
      let rolls = 0;
      const place = (type, amount, number = null) => {
        if (balance < amount) return;
        const r = e.placeBet(type, amount, number);
        if (r.success) balance -= amount;
      };
      const kinds = ['field', 'come', 'dontCome', 'odds', 'dontPassOdds', 'comeOdds', 'dontComeOdds', 'place', 'hardway', 'horn', 'big6', 'big8', 'anySeven', 'anyCraps'];
      for (let i = 0; i < 400; i++) {
        if (e.phase === 'comeOut') {
          place(passLine ? 'passLine' : 'dontPass', pick([5, 10, 25]));
        }
        const n = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) {
          const kind = pick(kinds);
          const amt = pick([1, 5, 10, 25]);
          if (kind === 'place') place('place', amt * 5, pick([4, 5, 6, 8, 9, 10]));
          else if (kind === 'hardway') place('hardway', amt, pick([4, 6, 8, 10]));
          else if (kind === 'horn') place('horn', amt, pick([2, 3, 11, 12]));
          else if (kind === 'comeOdds' || kind === 'dontComeOdds') place(kind, amt, pick([4, 5, 6, 8, 9, 10]));
          else place(kind, kind === 'field' || kind === 'come' || kind === 'dontCome' || kind.startsWith('big') ? amt * 5 : amt);
        }
        if (rnd() < 0.15) {
          const spot = pick(['field', 'place6', 'hard8', 'anySeven', 'dontPass', 'odds', 'comeNum6']);
          balance += e.removeSpot(spot).refund;
        }
        if (e.validateRoll()) continue;
        const r = await e.roll({ die1: 1 + Math.floor(rnd() * 6), die2: 1 + Math.floor(rnd() * 6) });
        rolls++;
        balance += r.payout;
        cum += r.net;
        expect(balance + totalOnTable(e.bets)).toBe(start + cum);
      }
      balance += e.clearRemovable().refund;
      expect(rolls).toBeGreaterThan(150);
      return { balance, cum, start, e };
    };

    it('balance = start - bets + payouts across 400 pass-line rolls', async () => {
      const { balance, start, cum, e } = await simulate(7, { passLine: true });
      expect(balance + totalOnTable(e.bets)).toBe(start + cum);
    });

    it('reconciles for don\'t-side play too', async () => {
      const { balance, start, cum, e } = await simulate(99, { passLine: false });
      expect(balance + totalOnTable(e.bets)).toBe(start + cum);
    });
  });
});

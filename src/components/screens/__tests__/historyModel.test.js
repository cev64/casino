import { describe, it, expect } from 'vitest';
import { normalizeRecord, normalizeHistory, summarize, groupByDay, dayLabel } from '../historyModel';

describe('normalizeRecord', () => {
  it('reads the current blackjack shape', () => {
    const r = normalizeRecord({ type: 'blackjack', bet: 50, payout: 125, netWin: 75, result: 'blackjack', endedAt: '2026-01-05T10:00:00Z', id: 'a' });
    expect(r).toMatchObject({ id: 'a', game: 'blackjack', bet: 50, net: 75, status: 'blackjack' });
  });

  it('computes net from payout - bet when netWin is missing', () => {
    expect(normalizeRecord({ game: 'blackjack', bet: 20, payout: 0, outcome: 'bust' })).toMatchObject({ net: -20, status: 'bust' });
    expect(normalizeRecord({ bet: 20, payout: 40, outcome: 'win' })).toMatchObject({ net: 20, status: 'win' });
  });

  it('maps lose and loss, and derives a status from the net', () => {
    expect(normalizeRecord({ type: 'blackjack', bet: 10, payout: 0, netWin: -10, result: 'lose' }).status).toBe('loss');
    expect(normalizeRecord({ type: 'blackjack', bet: 10, payout: 10 }).status).toBe('push');
  });

  it('derives a legacy craps roll from its outcomes', () => {
    const r = normalizeRecord({
      game: 'craps',
      roll: { die1: 3, die2: 4, total: 7 },
      outcomes: [
        { bet: 'passLine', result: 'win', amount: 10, payout: 20 },
        { bet: 'field', result: 'lose', amount: 5, payout: 0 },
        { bet: 'place6', result: 'win', amount: 12, payout: 14 },
      ],
    });
    expect(r.game).toBe('craps');
    expect(r.net).toBe(10 - 5 + 14);
    expect(r.status).toBe('win');
    expect(r.roll.total).toBe(7);
  });

  it('flags rolls without resolved bets and drops them from the list', () => {
    const rows = normalizeHistory([
      { game: 'craps', roll: { die1: 1, die2: 2, total: 3 }, outcomes: [{ bet: 'passLine', result: 'pointEstablished' }] },
      { type: 'blackjack', bet: 5, payout: 0, netWin: -5, result: 'loss', endedAt: '2026-01-05T10:00:00Z' },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('tolerates junk', () => {
    expect(normalizeRecord(null)).toBeNull();
    expect(normalizeRecord({})).toMatchObject({ game: 'blackjack', net: 0 });
  });
});

describe('summarize and grouping', () => {
  it('sums net and computes the win rate without pushes', () => {
    const s = summarize([
      { net: 10, status: 'win' }, { net: -5, status: 'loss' }, { net: 0, status: 'push' }, { net: 15, status: 'blackjack' },
    ]);
    expect(s).toMatchObject({ net: 20, played: 4, wins: 2, losses: 1 });
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(summarize([]).winRate).toBeNull();
  });

  it('labels days', () => {
    const now = new Date(2026, 0, 10, 12);
    expect(dayLabel(new Date(2026, 0, 10, 8), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 0, 9, 23), now)).toBe('Yesterday');
  });

  it('groups newest-first rows by day', () => {
    const now = new Date(2026, 0, 10, 12);
    const rows = [
      { time: new Date(2026, 0, 10, 9) }, { time: new Date(2026, 0, 10, 8) }, { time: new Date(2026, 0, 9, 8) },
    ];
    const g = groupByDay(rows, now);
    expect(g.map((x) => x.rows.length)).toEqual([2, 1]);
    expect(g[0].label).toBe('Today');
  });
});

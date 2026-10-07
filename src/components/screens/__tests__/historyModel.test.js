import { describe, it, expect } from 'vitest';
import { normalizeRecord, normalizeHistory, summarize, groupByDay, dayLabel, removeRecords, reinsertRemoved } from '../historyModel';

const TS = '2026-01-05T10:00:00Z';

describe('normalizeRecord', () => {
  it('reads the current blackjack shape', () => {
    const r = normalizeRecord({ type: 'blackjack', bet: 50, payout: 125, netWin: 75, result: 'blackjack', endedAt: '2026-01-05T10:00:00Z', id: 'a' });
    expect(r).toMatchObject({ id: 'a', game: 'blackjack', bet: 50, net: 75, status: 'blackjack' });
  });

  it('computes net from payout - bet when netWin is missing', () => {
    expect(normalizeRecord({ game: 'blackjack', bet: 20, payout: 0, outcome: 'bust', timestamp: TS })).toMatchObject({ net: -20, status: 'bust' });
    expect(normalizeRecord({ type: 'blackjack', bet: 20, payout: 40, outcome: 'win', timestamp: TS })).toMatchObject({ net: 20, status: 'win' });
  });

  it('maps lose and loss, and derives a status from the net', () => {
    expect(normalizeRecord({ type: 'blackjack', bet: 10, payout: 0, netWin: -10, result: 'lose', timestamp: TS }).status).toBe('loss');
    expect(normalizeRecord({ type: 'blackjack', bet: 10, payout: 10, timestamp: TS }).status).toBe('push');
  });

  it('derives a legacy craps roll from its outcomes', () => {
    const r = normalizeRecord({
      game: 'craps',
      timestamp: TS,
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
      { game: 'craps', timestamp: TS, roll: { die1: 1, die2: 2, total: 3 }, outcomes: [{ bet: 'passLine', result: 'pointEstablished' }] },
      { type: 'blackjack', bet: 5, payout: 0, netWin: -5, result: 'loss', endedAt: '2026-01-05T10:00:00Z' },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('tolerates junk', () => {
    expect(normalizeRecord(null)).toBeNull();
    expect(normalizeRecord({})).toBeNull();
  });

  it('skips records without a valid timestamp or a known game', () => {
    expect(normalizeRecord({ type: 'blackjack', bet: 5, result: 'win' })).toBeNull();
    expect(normalizeRecord({ type: 'blackjack', bet: 5, result: 'win', endedAt: 'not a date' })).toBeNull();
    expect(normalizeRecord({ type: 'blackjack', bet: 5, result: 'win', endedAt: null, timestamp: '' })).toBeNull();
    expect(normalizeRecord({ bet: 5, result: 'win', endedAt: TS })).toBeNull();
    expect(normalizeRecord({ type: 'roulette', bet: 5, result: 'win', endedAt: TS })).toBeNull();
    const rows = normalizeHistory([
      { type: 'blackjack', bet: 5, result: 'win' },
      { type: 'craps', bet: 5, result: 'win', endedAt: 'nope' },
      { type: 'blackjack', bet: 5, netWin: 5, result: 'win', endedAt: TS, id: 'ok' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['ok']);
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

describe('removeRecords and reinsertRemoved', () => {
  const list = [
    { id: 'a', type: 'blackjack' }, { id: 'b', type: 'craps' }, { id: 'c', game: 'blackjack' },
    { id: 'd', type: 'craps' }, { id: 'e', type: 'blackjack' },
  ];
  const ids = (xs) => xs.map((x) => x.id);

  it('removes only the chosen game and keeps the rest in order', () => {
    const { kept, removed } = removeRecords(list, 'blackjack');
    expect(ids(kept)).toEqual(['b', 'd']);
    expect(removed.map((x) => [x.record.id, x.index])).toEqual([['a', 0], ['c', 2], ['e', 4]]);
  });

  it('removes everything without a game', () => {
    const { kept, removed } = removeRecords(list);
    expect(kept).toEqual([]);
    expect(removed).toHaveLength(5);
  });

  it('puts removed records back at their original positions', () => {
    const { kept, removed } = removeRecords(list, 'blackjack');
    expect(reinsertRemoved(kept, removed)).toEqual(list);
    const all = removeRecords(list);
    expect(reinsertRemoved(all.kept, all.removed)).toEqual(list);
  });

  it('keeps records added after the clear', () => {
    const { kept, removed } = removeRecords(list, 'craps');
    const restored = reinsertRemoved([{ id: 'new', type: 'blackjack' }, ...kept], removed);
    expect(ids(restored)).toEqual(['new', 'a', 'b', 'c', 'd', 'e']);
  });
});

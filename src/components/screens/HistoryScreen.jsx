import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { RollingNumber, formatMoney } from '../ui/RollingNumber';
import { toast } from '../ui/Toast';
import { useGameStore } from '../../stores/gameStore';
import { Sparkline } from './Sparkline';
import { STATUS_LABEL, formatTime, groupByDay, normalizeHistory, summarize } from './historyModel';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'blackjack', label: 'Blackjack' },
  { value: 'craps', label: 'Craps' },
];

const PAGE = 40;
const SPARK_MAX = 50;

const GAME_NAME = { blackjack: 'Blackjack', craps: 'Craps' };

const netTone = (net) => (net > 0 ? 'text-good' : net < 0 ? 'text-bad' : 'text-ink-2');

const rowMeta = (r) => {
  const parts = [];
  if (r.game === 'craps' && r.roll) parts.push(`${r.roll.die1} + ${r.roll.die2} = ${r.roll.total}`);
  else if (r.bet > 0) parts.push(`${formatMoney(r.bet)} bet`);
  const t = formatTime(r.time);
  if (t) parts.push(t);
  return parts.join(' · ');
};

const Row = ({ r }) => (
  <motion.li
    layout="position"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
    exit={{ opacity: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
    transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
    className="hist-row"
  >
    <div className="flex-1 min-w-0">
      <p className="text-[16px] leading-6 font-medium text-ink truncate">{GAME_NAME[r.game]}</p>
      <p className="text-[14px] leading-5 text-ink-3 truncate tnum">{rowMeta(r)}</p>
    </div>
    <div className="text-right shrink-0">
      <p className={`text-[16px] leading-6 font-medium tnum ${netTone(r.net)}`}>{formatMoney(r.net, { signed: true })}</p>
      <p className="text-[12px] leading-4 font-medium text-ink-3">{STATUS_LABEL[r.status]}</p>
    </div>
  </motion.li>
);

const Stat = ({ label, children }) => (
  <div>
    <p className="t-micro">{label}</p>
    <p className="t-card-title tnum">{children}</p>
  </div>
);

export const HistoryScreen = () => {
  const gameHistory = useGameStore((s) => s.gameHistory);
  const refreshHistory = useGameStore((s) => s.refreshHistory);
  const clearHistory = useGameStore((s) => s.clearHistory);
  const restoreHistory = useGameStore((s) => s.restoreHistory);

  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  // Craps writes its rolls to storage a moment after they land; pick them up.
  useEffect(() => {
    refreshHistory();
    const t = setTimeout(refreshHistory, 700);
    return () => clearTimeout(t);
  }, [refreshHistory]);

  useEffect(() => { setLimit(PAGE); }, [filter]);

  const all = useMemo(() => normalizeHistory(gameHistory), [gameHistory]);
  const rows = useMemo(() => (filter === 'all' ? all : all.filter((r) => r.game === filter)), [all, filter]);
  const stats = useMemo(() => summarize(rows), [rows]);
  const groups = useMemo(() => groupByDay(rows.slice(0, limit)), [rows, limit]);

  const spark = useMemo(() => {
    const recent = rows.slice(0, SPARK_MAX).reverse(); // oldest first
    let total = 0;
    return recent.map((r) => {
      total += r.net;
      return {
        value: total,
        label: r.time ? `${r.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${formatTime(r.time)}` : 'Earlier',
      };
    });
  }, [rows]);

  const onClear = () => {
    const previous = clearHistory();
    if (!previous.length) return;
    toast('History cleared', { action: { label: 'Undo', onClick: () => restoreHistory(previous) } });
  };

  const winRate = stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`;

  return (
    <div className="grid gap-6 wide:grid-cols-[360px_minmax(0,1fr)] wide:gap-8 items-start">
      <div className="grid gap-4 wide:sticky wide:top-[76px]">
        <SegmentedControl label="Game" options={FILTERS} value={filter} onChange={setFilter} className="w-full" />

        <section className="glass p-5" aria-label="Summary">
          <p className="t-micro">Net result</p>
          <p className="t-hero mt-1">
            <RollingNumber value={stats.net} format={(n) => formatMoney(n, { signed: true })} />
          </p>
          <div className="flex gap-8 mt-4">
            <Stat label="Played">{stats.played}</Stat>
            <Stat label="Win rate">{winRate}</Stat>
          </div>
          {spark.length >= 2 && (
            <div className="mt-5 -mx-1">
              <Sparkline points={spark} />
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 min-w-0">
        {groups.length === 0 ? (
          <div className="glass px-5 py-10 text-center text-ink-2">Nothing played yet.</div>
        ) : (
          groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="t-micro group-label">{g.label}</h2>
              <ul className="glass p-2 m-0 list-none grid gap-0.5">
                <AnimatePresence initial={false}>
                  {g.rows.map((r) => <Row key={r.id} r={r} />)}
                </AnimatePresence>
              </ul>
            </section>
          ))
        )}

        {rows.length > limit && (
          <div className="flex justify-center">
            <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>Show more</Button>
          </div>
        )}

        {gameHistory.length > 0 && (
          <div className="flex justify-center pt-2">
            <Button variant="destructive" size="sm" onClick={onClear}>Clear history</Button>
          </div>
        )}
      </div>
    </div>
  );
};

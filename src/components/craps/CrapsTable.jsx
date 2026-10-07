import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCraps } from '../../hooks/useCraps';
import { haptic } from '../../stores/settingsStore';
import { Felt } from '../ui/Felt';
import { WinCelebration } from '../ui/WinCelebration';
import { RollingNumber, formatMoney } from '../ui/RollingNumber';
import { toast } from '../ui/Toast';
import { sounds } from '../../utils/sounds';
import { summarizeRoll, spotLabel } from '../../lib/craps';
import { CrapsBoard } from './CrapsBoard';
import { ControlDock, RACK_VALUES } from './ControlDock';
import { RollHistory } from './RollHistory';

/* ------------------------------------------------------------------------------------------------
 * Timing. The engine resolves a roll instantly; the table plays it back at a human pace so that
 * nothing (result, payouts, balance) shows before the dice that decide it have settled.
 * ---------------------------------------------------------------------------------------------- */
const SHAKE_MS = 260; // dice in hand
const TOSS_MS = 1000; // across the felt toward the back wall
const LAND_SOUND_MS = 380; // first bounce after the toss
const SETTLE_MS = 1000; // landing + a held beat before bets resolve
const RESOLVE_MS = 1700; // payout chips / sweep stay visible
const REDUCED = {
  SHAKE_MS: 80, TOSS_MS: 160, LAND_SOUND_MS: 0, SETTLE_MS: 350, RESOLVE_MS: 1200,
};

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const isTyping = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/** Which spot shows the result of an outcome. */
const outcomeSpot = (bet) => {
  let m = /^comeOdds(\d+)$/.exec(bet) || /^come(\d+)$/.exec(bet);
  if (m) return `comeNum${m[1]}`;
  m = /^dontComeOdds(\d+)$/.exec(bet) || /^dontCome(\d+)$/.exec(bet);
  if (m) return `dontComeNum${m[1]}`;
  return bet;
};

const buildMarks = (result) => {
  const marks = {};
  result.outcomes.forEach((o) => {
    if (o.result !== 'win' && o.result !== 'lose' && o.result !== 'push') return;
    const id = outcomeSpot(o.bet);
    const cur = marks[id] || { result: null, profit: 0 };
    cur.profit += Math.max(0, o.net);
    // one spot can carry a flat bet and its odds: winning beats pushing beats losing
    const rank = { win: 3, push: 2, lose: 1 };
    if (!cur.result || rank[o.result] > rank[cur.result]) cur.result = o.result;
    marks[id] = cur;
  });
  return marks;
};

const firstSeenKey = 'casino.craps.hintSeen';
const readHint = () => { try { return localStorage.getItem(firstSeenKey) === '1'; } catch { return true; } };
const writeHint = () => { try { localStorage.setItem(firstSeenKey, '1'); } catch { /* storage unavailable */ } };

export const CrapsTable = ({ active = true }) => {
  const {
    gameState, rollResult, balance, totalBets, undoDepth, canRebet,
    placeSpot, removeSpot, undoLast, clearBets, rebet, rollBlockedReason, roll, commitRoll,
  } = useCraps();

  const [chip, setChip] = useState(25);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState(null);
  const [summary, setSummary] = useState(null);
  const [marks, setMarks] = useState({});
  const [travel, setTravel] = useState(null);
  const [celebrate, setCelebrate] = useState({ show: false, payout: 0 });
  const [hintSeen, setHintSeen] = useState(readHint);

  const alive = useRef(true);
  const busyRef = useRef(false);
  const clearMarksTimer = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(clearMarksTimer.current); }; }, []);

  // Keep the selected chip affordable.
  useEffect(() => {
    if (balance >= chip) return;
    const fit = [...RACK_VALUES].reverse().find((v) => v <= balance);
    if (fit) setChip(fit);
  }, [balance, chip]);

  const rolls = gameState?.rollHistory || [];
  const phase = gameState?.phase || 'comeOut';
  const point = gameState?.point || null;

  /* ---------------- betting ---------------- */

  const dismissMarks = useCallback(() => {
    clearTimeout(clearMarksTimer.current);
    setMarks({});
    setTravel(null);
  }, []);

  const handlePlace = useCallback((spotId) => {
    if (busyRef.current) return;
    dismissMarks();
    const r = placeSpot(spotId, chip);
    if (r.success) {
      sounds.chipPlace?.();
      haptic(8);
      if (!hintSeen) { writeHint(); setHintSeen(true); }
    } else {
      sounds.error?.();
      toast(r.error, { tone: 'bad' });
    }
  }, [placeSpot, chip, hintSeen, dismissMarks]);

  const handleRemove = useCallback((spotId) => {
    if (busyRef.current) return;
    const r = removeSpot(spotId);
    if (r.success) {
      sounds.chipRemove?.();
      haptic(12);
      toast(`${spotLabel(spotId)} bet removed`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (r.undo()) { sounds.chipPlace?.(); haptic(8); } else toast('Could not restore that bet', { tone: 'warn' });
          },
        },
      });
    } else if (r.locked && r.reason) {
      haptic(6);
      toast(r.reason);
    }
  }, [removeSpot]);

  const handleUndo = useCallback(() => {
    if (busyRef.current) return;
    const r = undoLast();
    if (r.success) { sounds.chipRemove?.(); haptic(8); }
  }, [undoLast]);

  const handleClear = useCallback(() => {
    if (busyRef.current) return;
    const r = clearBets();
    if (!r.success) {
      toast(totalBets > 0 ? 'Remaining bets are locked until they resolve' : 'No bets to clear');
      return;
    }
    sounds.chipRemove?.();
    haptic(12);
    toast('Bets cleared', {
      action: {
        label: 'Undo',
        onClick: () => { if (r.undo()) sounds.chipStack?.(); else toast('Could not restore those bets', { tone: 'warn' }); },
      },
    });
  }, [clearBets, totalBets]);

  const handleRebet = useCallback(() => {
    if (busyRef.current) return;
    dismissMarks();
    const r = rebet();
    if (r.success) {
      sounds.chipStack?.();
      haptic(10);
      if (r.skipped) toast(`${r.placed} placed, ${r.skipped} not available now`, { tone: 'warn' });
    } else {
      toast(r.error, { tone: 'bad' });
    }
  }, [rebet, dismissMarks]);

  /* ---------------- rolling ---------------- */

  const handleRoll = useCallback(async () => {
    if (busyRef.current) return;
    const blocked = rollBlockedReason();
    if (blocked) {
      sounds.error?.();
      toast(blocked, { tone: 'bad' });
      return;
    }
    const t = prefersReduced() ? REDUCED : { SHAKE_MS, TOSS_MS, LAND_SOUND_MS, SETTLE_MS, RESOLVE_MS };

    busyRef.current = true;
    setBusy(true);
    dismissMarks();
    setSummary(null);
    sounds.diceShake?.();
    haptic([14, 26, 14]);

    const result = await roll();
    if (!result || result.error) {
      busyRef.current = false;
      setBusy(false);
      if (result?.error) toast(result.error, { tone: 'bad' });
      return;
    }

    // 1. across the felt
    setDice({ die1: result.roll.die1, die2: result.roll.die2, key: gameStateKey(result) });
    setRolling(true);
    await sleep(t.SHAKE_MS);
    sounds.diceRoll?.();
    await sleep(t.TOSS_MS);

    // 2. land and hold: bets stay exactly as they were
    if (!alive.current) { commitRoll(result); return; }
    setRolling(false);
    setTimeout(() => sounds.diceLand?.(), t.LAND_SOUND_MS);
    await sleep(t.SETTLE_MS);
    if (!alive.current) { commitRoll(result); return; }

    // 3. resolve: wallet, table state, payouts and sweeps
    const moved = result.outcomes.find((o) => o.result === 'moved' && o.bet === 'come');
    setTravel(moved ? { from: 'come', to: moved.toNumber } : null);
    const nextMarks = buildMarks(result);
    commitRoll(result);
    setMarks(nextMarks);

    const money = result.resolved.length > 0;
    const net = result.net;
    const words = summarizeRoll(result);
    setSummary({
      key: `${result.roll.die1}-${result.roll.die2}-${Date.now()}`,
      ...words,
      total: result.roll.total,
      net,
      status: money ? (net > 0 ? 'Win' : net < 0 ? 'Loss' : result.resolved.every((o) => o.result === 'push') ? 'Push' : 'Even') : null,
    });

    if (money) {
      if (net >= 100) sounds.bigWin?.();
      else if (net > 0) sounds.win?.();
      else if (net < 0) sounds.lose?.();
      else sounds.push?.();
      if (net > 0) {
        setCelebrate({ show: true, payout: net });
        setTimeout(() => alive.current && setCelebrate({ show: false, payout: 0 }), 1200);
      }
    } else {
      sounds.chipStack?.();
    }

    await sleep(t.RESOLVE_MS);
    if (!alive.current) return;
    setMarks({});
    setTravel(null);
    busyRef.current = false;
    setBusy(false);
  }, [roll, rollBlockedReason, commitRoll, dismissMarks]);

  /* ---------------- keyboard ---------------- */

  const handlersRef = useRef({});
  handlersRef.current = { handleRoll, handleUndo, handleClear, handleRebet, setChip, balance };

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (document.documentElement.classList.contains('modal-lock')) return;
      const h = handlersRef.current;
      const onControl = e.target instanceof Element && !!e.target.closest('button, a, [role="radio"]');
      const key = e.key;

      if (key === 'r' || key === 'R' || (key === ' ' && !onControl)) {
        e.preventDefault();
        if (!e.repeat) h.handleRoll();
      } else if (key === 'u' || key === 'U' || (key === 'Backspace' && !e.target.closest?.('.cr-spot'))) {
        e.preventDefault();
        h.handleUndo();
      } else if (key === 'c' || key === 'C') {
        e.preventDefault();
        h.handleClear();
      } else if (key === 'b' || key === 'B') {
        e.preventDefault();
        h.handleRebet();
      } else if (/^[1-9]$/.test(key)) {
        const v = RACK_VALUES[Number(key) - 1];
        if (v) {
          e.preventDefault(); // the app's 1/2 table switch must not fire while this table is open
          if (v <= h.balance) h.setChip(v);
        }
      }
    };
    // capture: this table's keys win over the shell's global 1 / 2 shortcuts
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  /* ---------------- render ---------------- */

  const stage = useMemo(() => ({ dice, rolling, summary }), [dice, rolling, summary]);
  const state = gameState;

  return (
    <div className="cr-root" data-active={active || undefined}>
      <WinCelebration show={celebrate.show} payout={celebrate.payout} />

      <div className="cr-readout glass">
        <div className="cr-stat">
          <span className="t-micro">Phase</span>
          <span className="t-card-title">{phase === 'point' && point ? `Point ${point}` : 'Come out'}</span>
        </div>
        <div className="cr-stat">
          <span className="t-micro">On table</span>
          <RollingNumber value={totalBets} className="t-card-title" />
        </div>
        <div className="cr-stat cr-stat-limits">
          <span className="t-micro">Limits</span>
          <span className="t-card-title tnum">{formatMoney(5)}{'–'}{formatMoney(500)}</span>
        </div>
        <RollHistory rolls={rolls} />
      </div>

      <Felt variant="craps" className="cr-felt" contentClassName="cr-felt-content">
        {state && (
          <CrapsBoard
            state={state}
            marks={marks}
            busy={busy}
            onPlace={handlePlace}
            onRemove={handleRemove}
            stage={stage}
            travel={travel}
          />
        )}
      </Felt>

      <p id="cr-spot-help" className="sr-only">
        Press Enter to place the selected chip. Press Delete, right-click, or press and hold to take the bet down.
      </p>
      {!hintSeen && (
        <p className="cr-hint-line">Tap a spot to bet. Press and hold, or right-click, to take a bet down.</p>
      )}

      <div className="cr-dock-wrap">
        <ControlDock
          chip={chip}
          onChip={setChip}
          balance={balance}
          busy={busy}
          canUndo={undoDepth > 0}
          canClear={totalBets > 0}
          canRebet={canRebet}
          onUndo={handleUndo}
          onClear={handleClear}
          onRebet={handleRebet}
          onRoll={handleRoll}
        />
      </div>

    </div>
  );
};

function gameStateKey(result) {
  return `${result.roll.die1}${result.roll.die2}-${performance.now().toFixed(0)}`;
}

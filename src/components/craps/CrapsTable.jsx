import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCraps } from '../../hooks/useCraps';
import { haptic } from '../../stores/settingsStore';
import { Felt } from '../ui/Felt';
import { WinCelebration } from '../ui/WinCelebration';
import { RollingNumber, formatMoney } from '../ui/RollingNumber';
import { toast } from '../ui/Toast';
import { sounds } from '../../utils/sounds';
import {
  summarizeRoll, describeOutcomes, outcomeSpotId, spotLabel, spotAmount, isFlatMinSpot, TABLE_LIMITS,
} from '../../lib/craps';
import { useWalletStore } from '../../stores/walletStore';
import { Chip } from '../ui/Chip';
import { CrapsBoard } from './CrapsBoard';
import { ControlDock, RACK_VALUES } from './ControlDock';
import { RollHistory } from './RollHistory';
import { useChipDrag } from './useChipDrag';
import { PayoutFlight } from './PayoutFlight';

/* ------------------------------------------------------------------------------------------------
 * Timing. The engine resolves a roll instantly; the table plays it back at a human pace so that
 * nothing (result, payouts, balance) shows before the dice that decide it have settled.
 * ---------------------------------------------------------------------------------------------- */
const SHAKE_MS = 260; // dice in hand
const TOSS_MS = 1000; // across the felt toward the back wall
const LAND_SOUND_MS = 380; // first bounce after the toss
const LAND_TIMEOUT_MS = 1600; // fallback if the dice never report landing (they normally do in ~1s)
const HOLD_MS = 900; // dice sit still so the roll registers before it is announced and settled
const RESOLVE_MS = 1700; // payout chips / sweep stay visible (the table is already open for bets)
const REDUCED = {
  SHAKE_MS: 80, TOSS_MS: 160, LAND_SOUND_MS: 0, LAND_TIMEOUT_MS: 0, HOLD_MS: 800, RESOLVE_MS: 1200,
};

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const isTyping = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/** The same message is never toasted twice in a row (rapid taps, or two handlers reporting one refusal). */
let lastNote = { message: '', at: 0 };
const notify = (message, opts) => {
  const now = Date.now();
  if (message === lastNote.message && now - lastNote.at < 1800) return;
  lastNote = { message, at: now };
  toast(message, opts);
};

const buildMarks = (result) => {
  const marks = {};
  result.outcomes.forEach((o) => {
    if (o.result !== 'win' && o.result !== 'lose' && o.result !== 'push') return;
    const id = outcomeSpotId(o.bet);
    const cur = marks[id] || { result: null, profit: 0 };
    cur.profit += Math.max(0, o.net);
    // One spot can carry a flat bet and its odds. A win shows as a win; otherwise a lost flat
    // bet must be seen going to the dealer even when its odds come back (odds off on the come-out).
    const rank = { win: 3, lose: 2, push: 1 };
    if (!cur.result || rank[o.result] > rank[cur.result]) cur.result = o.result;
    marks[id] = cur;
  });
  return marks;
};

/** Payout chips leave each spot that pays for the balance pill. Measured before the table changes. */
const planFlights = (result, root) => {
  if (prefersReduced() || !root) return [];
  const pill = document.querySelector('.topbar .wallet')?.getBoundingClientRect();
  if (!pill || !pill.width) return [];
  const to = { x: pill.left + pill.width / 2, y: pill.top + pill.height / 2 };
  const perSpot = new Map();
  result.resolved.forEach((o) => {
    if (o.payout > 0) perSpot.set(outcomeSpotId(o.bet), (perSpot.get(outcomeSpotId(o.bet)) || 0) + o.payout);
  });
  const stamp = Date.now();
  return [...perSpot].flatMap(([id, amount]) => {
    const r = root.querySelector(`.cr-spot[data-spot="${id}"]`)?.getBoundingClientRect();
    if (!r || !r.width) return [];
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return [{ key: `${stamp}-${id}`, id, amount, from, dx: to.x - from.x, dy: to.y - from.y }];
  });
};
const FLIGHT_SAFETY_MS = 3000; // the pill shows the full balance by then whatever happens

const firstSeenKey = 'casino.craps.hintSeen';
const readHint = () => { try { return localStorage.getItem(firstSeenKey) === '1'; } catch { return true; } };
const writeHint = () => { try { localStorage.setItem(firstSeenKey, '1'); } catch { /* storage unavailable */ } };

export const CrapsTable = ({ active = true }) => {
  const {
    gameState, balance, totalBets, newBets, undoDepth, canRebet,
    checkSpot, placeSpot, removeSpot, undoLast, clearBets, rebet, rollBlockedReason, roll, commitRoll,
  } = useCraps();

  const [chip, setChip] = useState(25);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState(null);
  const [summary, setSummary] = useState(null);
  const [marks, setMarks] = useState({});
  const [travel, setTravel] = useState(null);
  const [flights, setFlights] = useState([]);
  const [celebrate, setCelebrate] = useState({ show: false, payout: 0 });
  const [hintSeen, setHintSeen] = useState(readHint);

  const rootRef = useRef(null);
  const dockRef = useRef(null);
  const landWaiter = useRef(null);
  const onDiceSettled = useCallback(() => { landWaiter.current?.(); }, []);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const clearMarksTimer = useRef(0);

  // Winnings in flight to the balance pill: the pill holds them back until they land.
  const inFlight = useRef(0);
  const flightTimer = useRef(0);
  const settleFlights = useCallback(() => {
    clearTimeout(flightTimer.current);
    if (inFlight.current > 0) useWalletStore.getState().release(inFlight.current);
    inFlight.current = 0;
    setFlights([]);
  }, []);
  const landFlight = useCallback((f) => {
    const amount = Math.min(f.amount, inFlight.current);
    if (amount <= 0) return;
    inFlight.current -= amount;
    useWalletStore.getState().release(amount);
    sounds.chipStack?.();
    if (inFlight.current <= 0) settleFlights();
  }, [settleFlights]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(clearMarksTimer.current); settleFlights(); };
  }, [settleFlights]);

  // Keep the selected chip affordable.
  useEffect(() => {
    if (balance >= chip) return;
    const fit = [...RACK_VALUES].reverse().find((v) => v <= balance);
    if (fit) setChip(fit);
  }, [balance, chip]);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const rolls = gameState?.rollHistory || [];
  const phase = gameState?.phase || 'comeOut';
  const point = gameState?.point || null;

  /* ---------------- betting ---------------- */

  const dismissMarks = useCallback(() => {
    clearTimeout(clearMarksTimer.current);
    setMarks({});
    setTravel(null);
  }, []);

  const handlePlace = useCallback((spotId, amount = chip) => {
    if (busyRef.current) return;
    dismissMarks();
    const r = placeSpot(spotId, amount);
    if (r.success) {
      sounds.chipPlace?.();
      haptic(8);
      if (!hintSeen) { writeHint(); setHintSeen(true); }
      // say so now rather than when Roll refuses
      const now = spotAmount(gameStateRef.current?.bets, spotId) + amount;
      if (isFlatMinSpot(spotId) && now < TABLE_LIMITS.min) {
        notify(`${spotLabel(spotId)} needs at least ${formatMoney(TABLE_LIMITS.min)} to roll`, { tone: 'warn' });
      }
    } else {
      sounds.error?.();
      notify(r.error, { tone: 'bad' });
    }
  }, [placeSpot, chip, hintSeen, dismissMarks]);

  /* ---------------- drag and drop ---------------- */

  const { drag, ghostRef, startDrag } = useChipDrag({
    enabled: () => !busyRef.current,
    check: (spotId, value) => checkSpot(spotId, value),
    onPick: (value) => { setChip(value); haptic(6); },
    onDrop: (spotId, value) => handlePlace(spotId, value),
  });
  const dropTarget = useMemo(() => (drag?.spot ? { spot: drag.spot, ok: !drag.error } : null), [drag]);

  const handleRemove = useCallback((spotId) => {
    if (busyRef.current) return;
    const r = removeSpot(spotId);
    if (r.success) {
      sounds.chipRemove?.();
      haptic(12);
      toast(`${r.message || `${spotLabel(spotId)} taken down`}, ${formatMoney(r.refund)} back`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (busyRef.current) { toast('Wait for the dice', { tone: 'warn' }); return; }
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
      notify(totalBets > 0
        ? 'No new bets to clear. Bets from earlier rolls stay up: right-click or press and hold one to take it down.'
        : 'No bets to clear');
      return;
    }
    sounds.chipRemove?.();
    haptic(12);
    toast(`New bets cleared, ${formatMoney(r.refund)} back`, {
      action: {
        label: 'Undo',
        onClick: () => {
          if (busyRef.current) { toast('Wait for the dice', { tone: 'warn' }); return; }
          if (r.undo()) sounds.chipStack?.(); else toast('Could not restore those bets', { tone: 'warn' });
        },
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
      // bets the table doesn't take right now (line bets during a point, say) are skipped quietly
      if (r.short) toast('Not enough balance to repeat every bet', { tone: 'warn' });
    } else {
      notify(r.error, { tone: 'bad' });
    }
  }, [rebet, dismissMarks]);

  /* ---------------- rolling ---------------- */

  // Rolling from the dock while the dice stage is scrolled out of view (or under the dock):
  // bring the stage into the open band between the top bar and the dock, so the toss and the
  // result are seen. Smooth, or instant with reduced motion.
  const revealStage = useCallback(() => {
    const stageEl = rootRef.current?.querySelector('.cr-stage');
    if (!stageEl) return;
    const r = stageEl.getBoundingClientRect();
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const dockTop = dockRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    const limit = Math.min(window.innerHeight, dockTop) - 8;
    if (limit - top < r.height + 120) return; // no room to place it anyway
    if (r.top >= top && r.bottom <= limit - 110) return; // already comfortably in view (the toss starts below it)
    const delta = r.top + r.height / 2 - (top + limit - 40) / 2;
    const behavior = prefersReduced() ? 'auto' : 'smooth';
    // after this render commits, so the browser does not drop the smooth scroll
    requestAnimationFrame(() => window.scrollBy({ top: delta, behavior }));
  }, []);

  const handleRoll = useCallback(async () => {
    if (busyRef.current) return;
    const blocked = rollBlockedReason();
    if (blocked) {
      sounds.error?.();
      notify(blocked, { tone: 'bad' });
      return;
    }
    const t = prefersReduced() ? REDUCED : { SHAKE_MS, TOSS_MS, LAND_SOUND_MS, LAND_TIMEOUT_MS, HOLD_MS, RESOLVE_MS };

    busyRef.current = true;
    setBusy(true);
    dismissMarks();
    settleFlights();
    setSummary(null);
    revealStage();
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
    const landed = new Promise((resolve) => { landWaiter.current = resolve; });
    setRolling(false);
    setTimeout(() => sounds.diceLand?.(), t.LAND_SOUND_MS);
    // wait for both dice to come to rest, then hold so the roll can be read
    await Promise.race([landed, sleep(t.LAND_TIMEOUT_MS)]);
    landWaiter.current = null;
    await sleep(t.HOLD_MS);
    if (!alive.current) { commitRoll(result); return; }

    // 3. resolve: wallet, table state, payouts and sweeps
    const moved = result.outcomes.find((o) => o.result === 'moved' && o.bet === 'come');
    setTravel(moved ? { from: 'come', to: moved.toNumber } : null);
    const nextMarks = buildMarks(result);
    const plan = planFlights(result, rootRef.current);
    const flying = plan.reduce((sum, f) => sum + f.amount, 0);
    if (flying > 0) {
      // hold first: the deposit below must not show in the pill before the chips get there
      useWalletStore.getState().hold(flying);
      inFlight.current += flying;
      setFlights(plan);
      clearTimeout(flightTimer.current);
      flightTimer.current = setTimeout(settleFlights, FLIGHT_SAFETY_MS);
    }
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
      details: describeOutcomes(result),
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

    // The table opens for the next bets right away; the payout marks fade on their own
    // (or as soon as a new chip goes down).
    busyRef.current = false;
    setBusy(false);
    clearTimeout(clearMarksTimer.current);
    clearMarksTimer.current = setTimeout(() => {
      if (!alive.current) return;
      setMarks({});
      setTravel(null);
    }, t.RESOLVE_MS);
  }, [roll, rollBlockedReason, commitRoll, dismissMarks, revealStage, settleFlights]);

  /* ---------------- keyboard ---------------- */

  // Toasts rise above the sticky dock while this table is on screen
  useEffect(() => {
    const el = dockRef.current;
    const root = document.documentElement;
    if (!active || !el) return undefined;
    const sync = () => root.style.setProperty('--toast-lift', `${el.offsetHeight + 8}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--toast-lift'); };
  }, [active]);

  const handlersRef = useRef({});
  handlersRef.current = { handleRoll, handleUndo, handleClear, handleRebet, setChip, chip, balance };

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
      } else if ((key === 'ArrowRight' || key === 'ArrowLeft') && !e.target.closest?.('[role="radiogroup"]')) {
        // Same as blackjack: arrows step through affordable chips (the rack handles its own arrows when focused)
        e.preventDefault();
        const i = RACK_VALUES.indexOf(h.chip);
        const dir = key === 'ArrowRight' ? 1 : -1;
        for (let s = 1; s <= RACK_VALUES.length; s += 1) {
          const v = RACK_VALUES[(i + dir * s + RACK_VALUES.length * 2) % RACK_VALUES.length];
          if (v <= h.balance) { h.setChip(v); break; }
        }
      }
    };
    // capture: this table's keys win over the shell's global shortcuts
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  /* ---------------- render ---------------- */

  const stage = useMemo(() => ({ dice, rolling, summary, onDiceSettled }), [dice, rolling, summary, onDiceSettled]);
  const state = gameState;

  return (
    <div className="cr-root" ref={rootRef} data-active={active || undefined}>
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
        <RollHistory rolls={rolls} hint={!hintSeen} />
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
            dropTarget={dropTarget}
          />
        )}
      </Felt>

      <p id="cr-spot-help" className="sr-only">
        Press Enter to place the selected chip, or drag a chip from the rack onto the spot. Press Delete, right-click, or press and hold to take the bet down.
      </p>

      <div className="cr-dock-wrap" ref={dockRef}>
        <ControlDock
          chip={chip}
          onChip={setChip}
          balance={balance}
          busy={busy}
          canUndo={undoDepth > 0}
          canClear={newBets > 0}
          canRebet={canRebet}
          onUndo={handleUndo}
          onClear={handleClear}
          onRebet={handleRebet}
          onRoll={handleRoll}
          onDragChip={startDrag}
        />
      </div>

      {flights.length > 0 && <PayoutFlight flights={flights} onLand={landFlight} />}

      {drag && createPortal(
        <div
          ref={ghostRef}
          className="cr-ghost"
          data-target={drag.spot ? (drag.error ? 'bad' : 'ok') : undefined}
          aria-hidden="true"
        >
          <Chip value={drag.value} size="lg" />
          {drag.spot && (
            <span className="cr-ghost-tip">{drag.error || spotLabel(drag.spot)}</span>
          )}
        </div>,
        document.body,
      )}

    </div>
  );
};

function gameStateKey(result) {
  return `${result.roll.die1}${result.roll.die2}-${performance.now().toFixed(0)}`;
}

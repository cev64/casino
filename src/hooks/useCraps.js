import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CrapsEngine, SPOT_IDS, parseSpot, spotAmount, totalOnTable, TABLE_LIMITS } from '../lib/craps';
import { useWalletStore } from '../stores/walletStore';
import { useGameStore } from '../stores/gameStore';

/**
 * Craps game hook. Wraps the engine, the wallet and the history store.
 *
 * Money flow (the wallet always reconciles):
 *   placing a bet      -> wallet.withdraw(amount), engine holds the stake
 *   taking a bet down  -> wallet.deposit(refund)
 *   a roll             -> engine resolves bets immediately, but the UI reveals the result
 *                         after the dice settle: roll() returns the result and
 *                         commitRoll(result) then pays the wallet, updates the displayed
 *                         state and writes the history record.
 *   leaving the page   -> a pending roll is committed; bets left on the table are refunded
 *                         (the engine does not survive a reload).
 */
export const useCraps = () => {
  const [engine] = useState(() => new CrapsEngine());
  const [gameState, setGameState] = useState(() => engine.getGameState());
  const [isInitialized, setIsInitialized] = useState(false);
  const [rollResult, setRollResult] = useState(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const [canRebet, setCanRebet] = useState(false);

  const balance = useWalletStore((s) => s.balance);
  const withdraw = useWalletStore((s) => s.withdraw);
  const deposit = useWalletStore((s) => s.deposit);

  const undoStack = useRef([]);
  const rebetPlan = useRef(null);
  const pending = useRef(null); // a rolled-but-not-yet-revealed result

  const sync = useCallback(() => setGameState(engine.getGameState()), [engine]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await engine.initialize();
      if (!alive) return;
      setGameState(engine.getGameState());
      setIsInitialized(true);
    })();
    return () => { alive = false; };
  }, [engine]);

  /* ---------------- history ---------------- */

  const recordRoll = useCallback((result) => {
    if (!result.resolved?.length) return;
    const store = useGameStore.getState();
    const previous = store.currentGame; // endGame() needs a current game; don't clobber another table's
    store.setCurrentGame({ type: 'craps' });
    useGameStore.getState().endGame({
      bet: result.bet,
      payout: result.payout,
      netWin: result.net,
      result: result.net > 0 ? 'win' : result.net < 0 ? 'loss' : 'push',
      roll: { die1: result.roll.die1, die2: result.roll.die2, total: result.roll.total },
      point: result.pointBefore ?? null,
      outcomes: result.resolved.map((o) => ({ bet: o.bet, result: o.result, amount: o.amount, net: o.net })),
    });
    if (previous) useGameStore.getState().setCurrentGame(previous);
  }, []);

  /* ---------------- betting ---------------- */

  const placeSpot = useCallback((spotId, amount) => {
    const { betType, number } = parseSpot(spotId);
    const error = engine.validateBet(betType, amount, number);
    if (error) return { success: false, error };
    if (balance < amount) return { success: false, error: 'Not enough balance' };
    const w = withdraw(amount);
    if (!w.success) return { success: false, error: 'Not enough balance' };
    engine.placeBet(betType, amount, number);
    undoStack.current.push({ betType, number, amount, spot: spotId });
    setUndoDepth(undoStack.current.length);
    sync();
    return { success: true };
  }, [engine, balance, withdraw, sync]);

  /** Legacy signature: (betType, amount, number). */
  const placeBet = useCallback((betType, amount, number = null) => {
    const id = betType === 'place' ? `place${number}` : betType === 'hardway' ? `hard${number}` : betType === 'horn' ? `horn${number}` : betType;
    return placeSpot(id, amount);
  }, [placeSpot]);

  // Put taken-down bets back. Only valid until the next roll: afterwards the table has changed.
  const restore = useCallback((placements, nonce) => {
    const total = placements.reduce((s, p) => s + p.amount, 0);
    if (total <= 0 || engine.nonce !== nonce || pending.current) return false;
    if (useWalletStore.getState().balance < total) return false;
    if (!withdraw(total).success) return false;
    placements.forEach((p) => {
      engine.placeBet(p.betType, p.amount, p.number, { force: true });
      if (p.betType !== 'dontComeNumber') undoStack.current.push({ ...p });
    });
    setUndoDepth(undoStack.current.length);
    sync();
    return true;
  }, [engine, withdraw, sync]);

  const canRemove = useCallback((spotId) => engine.canRemoveSpot(spotId), [engine]);

  /** Take down a spot. Returns { success, refund, reason?, undo? }. */
  const removeSpot = useCallback((spotId) => {
    const r = engine.removeSpot(spotId);
    if (!r.refund) return { success: false, refund: 0, reason: r.reason || null, locked: !!r.locked };
    deposit(r.refund);
    undoStack.current = undoStack.current.filter((e) => e.spot !== spotId);
    setUndoDepth(undoStack.current.length);
    sync();
    const nonce = engine.nonce;
    return { success: true, refund: r.refund, undo: () => restore(r.placements, nonce) };
  }, [engine, deposit, sync, restore]);

  /** Undo the most recently placed chip. */
  const undoLast = useCallback(() => {
    const entry = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!entry) return { success: false };
    const taken = engine.reduceBet(entry.betType, entry.amount, entry.number);
    if (taken > 0) deposit(taken);
    sync();
    return { success: taken > 0, refund: taken };
  }, [engine, deposit, sync]);

  /** Take down everything that may be taken down. Locked contract bets stay. */
  const clearBets = useCallback(() => {
    const nonce = engine.nonce;
    const r = engine.clearRemovable();
    if (r.refund > 0) deposit(r.refund);
    undoStack.current = [];
    setUndoDepth(0);
    sync();
    return { success: r.refund > 0, refund: r.refund, undo: () => restore(r.placements, nonce) };
  }, [engine, deposit, sync, restore]);

  /** Put the previous roll's bets back (only what is missing and legal right now). */
  const rebet = useCallback(() => {
    const plan = rebetPlan.current;
    if (!plan) return { success: false, error: 'No previous bets to repeat' };
    let placed = 0;
    let skipped = 0;
    let lastError = null;
    let short = false;
    Object.entries(plan).forEach(([spotId, wanted]) => {
      const missing = wanted - spotAmount(engine.bets, spotId);
      if (missing <= 0) return;
      const { betType, number } = parseSpot(spotId);
      const error = engine.validateBet(betType, missing, number);
      if (error) { skipped += 1; lastError = error; return; }
      if (useWalletStore.getState().balance < missing) { short = true; skipped += 1; return; }
      if (!withdraw(missing).success) { short = true; skipped += 1; return; }
      engine.placeBet(betType, missing, number);
      undoStack.current.push({ betType, number, amount: missing, spot: spotId });
      placed += 1;
    });
    setUndoDepth(undoStack.current.length);
    sync();
    if (placed === 0) return { success: false, error: short ? 'Not enough balance' : (lastError || 'Your bets are already on the table') };
    return { success: true, placed, skipped };
  }, [engine, withdraw, sync]);

  /* ---------------- rolling ---------------- */

  const rollBlockedReason = useCallback(() => engine.validateRoll(), [engine]);

  /**
   * Roll. The engine resolves immediately; the returned result carries everything the UI
   * needs to animate. Call commitRoll(result) once the result is revealed.
   */
  const roll = useCallback(async () => {
    if (pending.current) return null;
    const blocked = engine.validateRoll();
    if (blocked) return { error: blocked };

    // Dev-only deterministic dice for lab scripts: window.__crapsRolls = [[3,4],[6,6]]
    let forced = null;
    if (import.meta.env?.DEV && typeof window !== 'undefined' && Array.isArray(window.__crapsRolls) && window.__crapsRolls.length) {
      const [die1, die2] = window.__crapsRolls.shift();
      forced = { die1, die2 };
    }

    rebetPlan.current = engine.spotAmounts();
    const result = await engine.roll(forced);
    pending.current = result;
    undoStack.current = [];
    setUndoDepth(0);
    setRollResult(result);
    return result;
  }, [engine]);

  const commitRoll = useCallback((result) => {
    if (!result || pending.current !== result) return;
    pending.current = null;
    if (result.payout > 0) deposit(result.payout);
    recordRoll(result);
    setCanRebet(true);
    sync();
  }, [deposit, recordRoll, sync]);

  // The engine doesn't survive leaving the page: settle a pending roll, refund bets left up.
  useEffect(() => {
    const onHide = (e) => {
      if (e.persisted) return; // bfcache: the page (and engine) comes back intact
      if (pending.current) {
        const r = pending.current;
        pending.current = null;
        if (r.payout > 0) useWalletStore.getState().deposit(r.payout);
        recordRoll(r);
      }
      const left = totalOnTable(engine.bets);
      if (left > 0) {
        useWalletStore.getState().deposit(left);
        engine.resetBets();
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [engine, recordRoll]);

  const totalBets = useMemo(() => totalOnTable(gameState?.bets), [gameState]);

  return {
    gameState,
    isInitialized,
    rollResult,
    balance,
    totalBets,
    limits: TABLE_LIMITS,
    spots: SPOT_IDS,
    undoDepth,
    canRebet,
    placeSpot,
    placeBet,
    removeSpot,
    canRemove,
    undoLast,
    clearBets,
    rebet,
    rollBlockedReason,
    roll,
    commitRoll,
  };
};

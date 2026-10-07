import { useState, useEffect, useCallback, useRef } from 'react';
import { BlackjackSession } from '../lib/blackjack';
import { useWalletStore } from '../stores/walletStore';
import { useGameStore } from '../stores/gameStore';

// Safety net: if the table never calls settle() (unmounted, interrupted), pay out anyway.
const SETTLE_FALLBACK_MS = 12000;

const copyCard = (c) => ({ ...c });

/** Plain copy of the engine state so React never sees the engine's mutable arrays. */
const snapshot = (s, round) => ({
  ...s,
  round,
  dealerHand: s.dealerHand.map(copyCard),
  playerHands: s.playerHands.map((h) => h.map(copyCard)),
  handBets: [...s.handBets],
  handFlags: s.handFlags.map((f) => ({ ...f })),
  result: s.result ? { ...s.result, handResults: s.result.handResults.map((r) => ({ ...r })) } : null,
});

/**
 * Blackjack round controller: one `BlackjackSession` (engine + wallet + history).
 * Every action resolves to `{ ok, error?, state? }`. Payouts are deferred until `settle()` so the
 * balance never changes before the hole card is turned over.
 */
export const useBlackjack = () => {
  const [gameState, setGameState] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const balance = useWalletStore((s) => s.balance);
  const roundRef = useRef(0);
  const lockRef = useRef(false);
  const fallbackRef = useRef(0);

  const sessionRef = useRef(null);
  if (!sessionRef.current) {
    sessionRef.current = new BlackjackSession({
      deferSettle: true,
      wallet: {
        balance: () => useWalletStore.getState().balance,
        withdraw: (n) => useWalletStore.getState().withdraw(n),
        deposit: (n) => useWalletStore.getState().deposit(n),
      },
      history: {
        begin: ({ bet }) => useGameStore.getState().setCurrentGame({
          type: 'blackjack',
          bet,
          startedAt: new Date().toISOString(),
        }),
        end: (record) => useGameStore.getState().endGame(record),
      },
    });
  }
  const session = sessionRef.current;

  useEffect(() => {
    let alive = true;
    session.initialize().then(() => {
      if (alive) setIsInitialized(true);
    });
    return () => { alive = false; };
  }, [session]);

  const publish = useCallback((res) => {
    if (res.ok && res.state) {
      setGameState(snapshot(res.state, roundRef.current));
      if (res.state.gameState === 'finished') {
        clearTimeout(fallbackRef.current);
        fallbackRef.current = setTimeout(() => session.settle(), SETTLE_FALLBACK_MS);
      }
    }
    return res;
  }, [session]);

  const run = useCallback(async (fn) => {
    if (lockRef.current) return { ok: false, error: 'Busy' };
    lockRef.current = true;
    try {
      return publish(await fn());
    } finally {
      lockRef.current = false;
    }
  }, [publish]);

  const deal = useCallback((bet) => {
    clearTimeout(fallbackRef.current);
    roundRef.current += 1;
    return run(() => session.deal(bet));
  }, [run, session]);

  const hit = useCallback(() => run(() => session.hit()), [run, session]);
  const stand = useCallback(() => run(() => session.stand()), [run, session]);
  const doubleDown = useCallback((faceDown = true) => run(() => session.double(faceDown)), [run, session]);
  const split = useCallback(() => run(() => session.split()), [run, session]);
  const surrender = useCallback(() => run(() => session.surrender()), [run, session]);
  const insurance = useCallback((take) => run(() => session.insurance(take)), [run, session]);

  /** Pay out the finished round and write its history record. Idempotent. */
  const settle = useCallback(() => {
    clearTimeout(fallbackRef.current);
    return session.settle();
  }, [session]);

  useEffect(() => () => clearTimeout(fallbackRef.current), []);

  return {
    gameState,
    isInitialized,
    balance,
    deal,
    startHand: deal,
    hit,
    stand,
    doubleDown,
    split,
    surrender,
    insurance,
    settle,
  };
};

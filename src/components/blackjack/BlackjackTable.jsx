import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlackjack } from '../../hooks/useBlackjack';
import { useWalletStore } from '../../stores/walletStore';
import { haptic } from '../../stores/settingsStore';
import { Hand } from '../ui/Card';
import { Felt } from '../ui/Felt';
import { CHIP_VALUES } from '../ui/Chip';
import { DealerChat } from '../ui/DealerChat';
import { WinCelebration } from '../ui/WinCelebration';
import { toast } from '../ui/Toast';
import { formatMoney } from '../ui/RollingNumber';
import { sounds } from '../../utils/sounds';
import { RULES, rulesPrint } from '../../lib/blackjack';
import { BetCircle } from './BetCircle';
import { ControlDock } from './ControlDock';
import { Shoe } from './Shoe';
import { OUTCOME_WORD, chipBreakdown, evaluate, handLabel, moneyOpts } from './handMath';
import { useMediaQuery } from './useMediaQuery';

/* ------------------------------------------------------------------------------------------------
 * Timing. The engine resolves a round instantly; the table plays it back at a human pace so that
 * nothing (totals, outcome, balance) shows before the cards that decide it have landed.
 * ---------------------------------------------------------------------------------------------- */
const DEAL_MS = 1250; // four cards out of the shoe
const HIT_MS = 620; // one card lands
const SPLIT_MS = 1100;
const FLIP_MS = 520;
const DRAW_MS = 720; // between dealer draws
const BEAT_MS = 450;
const COLLECT_MS = 2300; // after the result: pull the chips back

const money = (n, opts) => formatMoney(n, moneyOpts(n, opts));
const INITIAL_PRES = {
  fresh: false,
  landed: true,
  holeUp: false,
  dealerCount: 2,
  dealerPill: 2,
  doublesUp: false,
  resultShown: false,
  collected: false,
  splitLimit: false, // index of the hand that was just split (its two hands show one card until dealt)
};

const isTyping = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const Pill = ({ children, active = false, tone, label, className = '' }) => (
  <span className={`bj-pill tnum ${className}`} data-active={active || undefined} data-tone={tone || undefined} aria-label={label}>
    {children}
  </span>
);

/** Net result of one hand as `{ word, amount }`. Push carries no amount. */
const describeHand = (r) => {
  if (!r) return null;
  const net = Math.round((r.payout - r.bet) * 100) / 100;
  const word = r.evenMoney ? 'Even money' : OUTCOME_WORD[r.outcome] || r.outcome;
  const tone = r.outcome === 'push' ? 'neutral' : net > 0 ? 'good' : 'bad';
  return { word, net, tone, showAmount: r.outcome !== 'push' };
};

export const BlackjackTable = ({ active = true }) => {
  const { gameState: gs, isInitialized, deal, hit, stand, doubleDown, split, surrender, insurance, settle } = useBlackjack();
  const balance = useWalletStore((s) => s.balance);

  const [mode, setMode] = useState('betting'); // 'betting' | 'round'
  const [bet, setBet] = useState(0);
  const [chipLog, setChipLog] = useState([]); // chips placed this bet, newest last (for Undo)
  const [lastBet, setLastBet] = useState(0);
  const [chip, setChip] = useState(25);
  const [flights, setFlights] = useState([]);
  const [pres, setPres] = useState(INITIAL_PRES);
  const [dealerEvent, setDealerEvent] = useState(null);
  const [penetration, setPenetration] = useState(0);
  const [enterFromRack, setEnterFromRack] = useState(false);

  const wide = useMediaQuery('(min-width: 1024px)');
  const roomy = useMediaQuery('(min-width: 600px)');
  const h1000 = useMediaQuery('(min-height: 1000px)');
  const h880 = useMediaQuery('(min-height: 880px)');
  const h800 = useMediaQuery('(min-height: 800px)');
  // Cards scale with the room: the table and its dock should fit without scrolling during a hand.
  const cardSize = roomy ? (wide && h1000 ? 'lg' : h880 ? 'md' : 'sm') : h800 ? 'md' : 'sm';

  /* ---------- timers ---------- */
  const timers = useRef(new Set());
  const timeline = useRef([]); // pending showdown steps, runnable early by skip()
  const activeRef = useRef(active);
  activeRef.current = active;
  const flightId = useRef(0);

  const later = useCallback((ms, fn) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    timeline.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const play = useCallback((name) => {
    if (activeRef.current) sounds[name]?.();
  }, []);

  const patch = useCallback((p) => setPres((s) => ({ ...s, ...p })), []);

  /* ---------- shoe read-out ---------- */
  useEffect(() => {
    if (gs) setPenetration(gs.penetration);
  }, [gs]);

  /* ---------- keep the selected chip affordable ---------- */
  useEffect(() => {
    if (mode !== 'betting' || balance <= 0) return;
    if (chip - 0 > balance) {
      const fit = [...CHIP_VALUES].reverse().find((v) => v <= balance);
      if (fit) setChip(fit);
    }
  }, [balance, chip, mode]);

  /* ---------- betting ---------- */
  const addFlight = useCallback((value, dir) => {
    const id = ++flightId.current;
    setFlights((f) => [...f, { id, value, dir }]);
    later(360, () => setFlights((f) => f.filter((x) => x.id !== id)));
  }, [later]);

  const addChip = useCallback((value = chip) => {
    if (mode !== 'betting') return;
    if (bet + value > balance) {
      toast('Not enough balance', { tone: 'bad' });
      sounds.error?.();
      return;
    }
    setEnterFromRack(false);
    setBet((b) => b + value);
    setChipLog((l) => [...l, value]);
    addFlight(value, 'in');
    later(200, () => (bet + value >= 100 ? sounds.chipStack?.() : sounds.chipPlace?.()));
    haptic(8);
  }, [mode, chip, bet, balance, addFlight, later]);

  const undoChip = useCallback(() => {
    if (mode !== 'betting' || bet <= 0) return;
    const last = chipLog[chipLog.length - 1] ?? Math.min(chip, bet);
    setBet((b) => Math.max(0, b - last));
    setChipLog((l) => l.slice(0, -1));
    addFlight(last, 'out');
    sounds.chipRemove?.();
  }, [mode, bet, chipLog, chip, addFlight]);

  const clearBet = useCallback(() => {
    if (mode !== 'betting' || bet <= 0) return;
    const prevBet = bet;
    const prevLog = chipLog;
    setBet(0);
    setChipLog([]);
    sounds.chipRemove?.();
    toast('Bet cleared', {
      action: {
        label: 'Undo',
        onClick: () => { setEnterFromRack(true); setBet(prevBet); setChipLog(prevLog); sounds.chipPlace?.(); },
      },
    });
  }, [mode, bet, chipLog]);

  const rebet = useCallback(() => {
    if (mode !== 'betting' || !lastBet) return;
    if (lastBet > balance) {
      toast('Not enough balance', { tone: 'bad' });
      sounds.error?.();
      return;
    }
    setEnterFromRack(true);
    setBet(lastBet);
    setChipLog(chipBreakdown(lastBet, CHIP_VALUES));
    sounds.chipStack?.();
    haptic(8);
  }, [mode, lastBet, balance]);

  const doubleBet = useCallback(() => {
    if (mode !== 'betting' || bet <= 0) return;
    if (bet * 2 > balance) {
      toast('Not enough balance', { tone: 'bad' });
      sounds.error?.();
      return;
    }
    setEnterFromRack(true);
    setChipLog((l) => [...l, ...l]);
    setBet((b) => b * 2);
    sounds.chipStack?.();
    haptic(8);
  }, [mode, bet, balance]);

  /* ---------- round presentation ---------- */
  const runShowdown = useCallback((state, delay) => {
    const steps = [];
    let t = delay;
    const dealerCards = state.dealerHand.length;
    const anyDoubled = state.handFlags.some((f) => f.doubled);

    steps.push({ at: t, fn: () => { patch({ holeUp: true }); play('cardFlip'); } });
    steps.push({ at: t + 380, fn: () => patch({ dealerPill: 2 }) });
    t += FLIP_MS + 200;
    for (let k = 2; k < dealerCards; k += 1) {
      steps.push({ at: t, fn: () => { patch({ dealerCount: k + 1 }); play('cardDeal'); } });
      steps.push({ at: t + 520, fn: () => patch({ dealerPill: k + 1 }) });
      t += DRAW_MS;
    }
    if (dealerCards > 2) t += 80;
    if (anyDoubled) {
      steps.push({ at: t, fn: () => { patch({ doublesUp: true }); play('cardFlip'); } });
      t += FLIP_MS + 200;
    } else {
      t += BEAT_MS - 200;
    }

    const r = state.result;
    steps.push({
      at: t,
      fn: () => {
        patch({ resultShown: true, dealerCount: dealerCards, dealerPill: dealerCards, holeUp: true, doublesUp: true });
        settle();
        const net = r.net;
        const big = net >= 100 && net >= r.bet;
        if (r.outcome === 'blackjack') { play(big ? 'bigWin' : 'win'); setDealerEvent(null); haptic([14, 40, 14]); }
        else if (r.dealerBlackjack && net < 0) { play('lose'); setDealerEvent(r.insurance ? null : 'dealerBlackjack'); haptic(12); }
        else if (net > 0) { play(big ? 'bigWin' : 'win'); setDealerEvent(null); haptic(big ? [14, 40, 14] : 10); }
        else if (net === 0 && r.outcome === 'push') { play('push'); setDealerEvent(null); haptic(8); }
        else { play('lose'); setDealerEvent(null); haptic(12); }
      },
    });
    steps.push({ at: t + COLLECT_MS, fn: () => patch({ collected: true }), late: true });

    timeline.current = steps.map((s) => ({ ...s, done: false }));
    timeline.current.forEach((s) => {
      later(s.at, () => { if (!s.done) { s.done = true; s.fn(); } });
    });
  }, [later, patch, play, settle]);

  /** Tap the felt to jump to the result. */
  const skip = useCallback(() => {
    const pending = timeline.current.filter((s) => !s.done && !s.late);
    if (!pending.length || pres.resultShown) return;
    pending.forEach((s) => { s.done = true; s.fn(); });
  }, [pres.resultShown]);

  /** After any engine action: let the new cards land, then play the rest of the round. */
  const afterAction = useCallback((state, kind) => {
    const landMs = { deal: DEAL_MS, split: SPLIT_MS, hit: HIT_MS, double: HIT_MS + 120 }[kind] ?? 160;
    patch({ landed: false });
    later(landMs, () => patch({ landed: true, fresh: false }));
    if (state.gameState === 'insurance') later(landMs + 200, () => setDealerEvent('insurance'));
    if (state.gameState === 'finished') runShowdown(state, landMs + 160);
  }, [later, patch, runShowdown]);

  /* ---------- actions ---------- */
  const dealRound = useCallback(async (amount) => {
    if (!isInitialized) return;
    if (amount <= 0) { toast('Place a bet first'); return; }
    if (amount > balance) { toast('Not enough balance', { tone: 'bad' }); sounds.error?.(); return; }
    clearTimers();
    setPres({ ...INITIAL_PRES, fresh: true, landed: false });
    const res = await deal(amount);
    if (!res.ok) {
      patch({ fresh: false, landed: true });
      if (res.error && res.error !== 'Busy') toast(res.error, { tone: 'bad' });
      return;
    }
    setMode('round');
    setLastBet(amount);
    setBet(0);
    setChipLog([]);
    setDealerEvent('deal');
    [100, 250, 400, 550].forEach((ms) => later(ms, () => play('cardDeal')));
    if (res.state.reshuffled) {
      toast('Shuffling');
      sounds.shuffle?.();
      setDealerEvent('shuffle');
    }
    haptic(10);
    afterAction(res.state, 'deal');
  }, [isInitialized, balance, clearTimers, deal, later, play, afterAction, patch]);

  const canAct = !!gs && gs.gameState === 'player-turn' && pres.landed && mode === 'round';

  const act = useCallback(async (kind, fn, sound, event, before) => {
    if (!canAct) return;
    before?.();
    const res = await fn();
    if (!res.ok) {
      if (kind === 'split') patch({ splitLimit: false });
      if (res.error && res.error !== 'Busy' && res.error !== 'Not available') {
        toast(res.error, { tone: 'bad' });
        sounds.error?.();
      }
      return;
    }
    if (event) setDealerEvent(event);
    if (sound) later(80, () => play(sound));
    if (kind === 'split') later(380, () => { patch({ splitLimit: false }); play('cardDeal'); });
    afterAction(res.state, kind);
  }, [canAct, later, play, afterAction, patch]);

  const onHit = useCallback(() => act('hit', hit, 'cardDeal', 'hit'), [act, hit]);
  const onStand = useCallback(() => act('stand', stand, 'buttonClick', 'stand'), [act, stand]);
  const onDouble = useCallback(() => {
    if (!gs?.canDoubleDown) return;
    return act('double', () => doubleDown(true), 'cardDeal', 'doubleDown');
  }, [act, doubleDown, gs]);
  const onSplit = useCallback(() => {
    if (!gs?.canSplit) return;
    const at = gs.currentHandIndex;
    return act('split', split, 'cardFlip', 'split', () => patch({ splitLimit: at }));
  }, [act, split, gs, patch]);
  const onSurrender = useCallback(() => {
    if (!gs?.canSurrender) return;
    return act('surrender', surrender, 'buttonClick', 'surrender');
  }, [act, surrender, gs]);

  const onInsurance = useCallback(async (take) => {
    if (!gs || gs.gameState !== 'insurance' || !pres.landed) return;
    const res = await insurance(take);
    if (!res.ok) {
      if (res.error && res.error !== 'Busy') { toast(res.error, { tone: 'bad' }); sounds.error?.(); }
      return;
    }
    if (take && !gs.evenMoneyOffered) later(0, () => sounds.chipPlace?.());
    if (!take || gs.evenMoneyOffered) setDealerEvent(null);
    afterAction(res.state, 'insurance');
  }, [gs, pres.landed, insurance, later, afterAction]);

  const newBet = useCallback(() => {
    clearTimers();
    setPres(INITIAL_PRES);
    setMode('betting');
    setBet(0);
    setChipLog([]);
    setEnterFromRack(false);
    setDealerEvent(null);
  }, [clearTimers]);

  const dealAgain = useCallback(() => {
    setEnterFromRack(true);
    return dealRound(lastBet);
  }, [dealRound, lastBet]);

  /* ---------- derived view ---------- */
  const round = gs?.round ?? 0;
  const inRound = mode === 'round' && !!gs;
  const finished = inRound && gs.gameState === 'finished';
  const resultShown = finished && pres.resultShown;
  const handResults = resultShown ? gs.result.handResults : null;

  const dockMode = !inRound ? 'betting'
    : gs.gameState === 'insurance' && pres.landed ? 'insurance'
    : resultShown ? 'result'
    : 'play';

  const dealerCards = useMemo(() => {
    if (!inRound) return [];
    return gs.dealerHand.slice(0, pres.dealerCount).map((c, i) => ({ ...c, faceDown: i === 1 && !pres.holeUp }));
  }, [inRound, gs, pres.dealerCount, pres.holeUp]);

  const hands = useMemo(() => {
    if (!inRound) return [];
    const single = gs.playerHands.length === 1;
    return gs.playerHands.map((cards, i) => {
      const flags = gs.handFlags[i] || {};
      const doubleHidden = flags.doubled && !pres.doublesUp;
      const limit = pres.splitLimit !== false && !single && (i === pres.splitLimit || i === pres.splitLimit + 1) ? 1 : null;
      const shownCards = (limit ? cards.slice(0, limit) : cards).map((c, k, arr) => ({
        ...c,
        faceDown: !!(flags.doubled && k === arr.length - 1 && k >= 2 && !pres.doublesUp),
      }));
      const visible = shownCards.filter((c) => !c.faceDown);
      return { cards: shownCards, visible, flags, doubleHidden, single, bet: gs.handBets[i] };
    });
  }, [inRound, gs, pres.doublesUp, pres.splitLimit]);

  const pillFor = (h) => {
    if (!pres.landed || h.doubleHidden || h.visible.length === 0) return null;
    return handLabel(h.visible, { natural: h.single && !h.flags.fromSplit });
  };

  const dealerPill = useMemo(() => {
    if (!inRound || !pres.landed || dealerCards.length === 0) return null;
    if (!pres.holeUp) {
      const up = dealerCards[0];
      return { text: up.rank === 'A' ? 'Ace' : String(evaluate([up]).total), aria: `Showing ${up.rank}`, kind: 'hard' };
    }
    const shown = gs.dealerHand.slice(0, pres.dealerPill);
    if (pres.dealerPill < 2) return null;
    return handLabel(shown, { natural: true });
  }, [inRound, pres.landed, pres.holeUp, pres.dealerPill, dealerCards, gs]);

  const affordDouble = !!gs && gs.handBets[gs.currentHandIndex] <= balance;
  const doubleReason = !gs?.canDoubleDown ? 'First two cards only' : !affordDouble ? 'Not enough balance' : null;
  const splitReason = !gs?.canSplit ? 'Needs a pair' : !affordDouble ? 'Not enough balance' : null;

  const insuranceInfo = useMemo(() => {
    if (!gs || gs.gameState !== 'insurance') return null;
    const cost = Math.round((gs.handBets[0] / 2) * 100) / 100;
    if (gs.evenMoneyOffered) {
      return { title: 'Even money?', meta: `Take ${money(gs.handBets[0])} now`, canAfford: true };
    }
    return { title: 'Insurance?', meta: `${money(cost)}, pays 2 to 1`, canAfford: cost <= balance };
  }, [gs, balance]);

  /* ---------- keyboard ---------- */
  const keyApi = useRef({});
  keyApi.current = {
    dockMode, bet, lastBet, balance, canAct, chip, finished, pres,
    addChip, undoChip, clearBet, rebet, newBet, dealAgain, dealRound, skip,
    onHit, onStand, onDouble, onSplit, onSurrender, onInsurance, setChip,
  };

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (document.documentElement.classList.contains('modal-lock')) return;
      const k = keyApi.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const onButton = (e.target?.tagName === 'BUTTON' && !e.target.classList.contains('bj-circle')) || e.target?.tagName === 'A';
      const take = () => { e.preventDefault(); };

      if (key === 'Enter' && !onButton) {
        if (k.dockMode === 'betting') { take(); k.dealRound(k.bet); }
        else if (k.dockMode === 'result') { take(); k.dealAgain(); }
        else if (!k.finished || !k.pres.resultShown) { take(); k.skip(); }
        return;
      }
      if (k.dockMode === 'betting') {
        if (key === 'Backspace') { take(); k.undoChip(); }
        else if (key === 'c') { take(); k.clearBet(); }
        else if (key === 'r') { take(); k.bet > 0 ? null : k.rebet(); }
        else if (key === 'ArrowRight' || key === 'ArrowLeft') {
          if (e.target?.closest?.('[role="radiogroup"]')) return; // the rack handles its own arrows
          take();
          const i = CHIP_VALUES.indexOf(k.chip);
          const dir = key === 'ArrowRight' ? 1 : -1;
          for (let s = 1; s <= CHIP_VALUES.length; s += 1) {
            const v = CHIP_VALUES[(i + dir * s + CHIP_VALUES.length * 2) % CHIP_VALUES.length];
            if (v <= k.balance) { k.setChip(v); break; }
          }
        }
        return;
      }
      if (k.dockMode === 'play') {
        if (key === 'h') { take(); k.onHit(); }
        else if (key === 's') { take(); k.onStand(); }
        else if (key === 'd') { take(); k.onDouble(); }
        else if (key === 'p') { take(); k.onSplit(); }
        else if (key === 'u') { take(); k.onSurrender(); }
        return;
      }
      if (k.dockMode === 'insurance') {
        if (key === 'y') { take(); k.onInsurance(true); }
        else if (key === 'n') { take(); k.onInsurance(false); }
        return;
      }
      if (k.dockMode === 'result') {
        if (key === 'n') { take(); k.newBet(); }
        else if (key === 'r') { take(); k.dealAgain(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  /* ---------- render ---------- */
  const printLines = rulesPrint(RULES).split(' · ');
  const dealerNet = resultShown ? gs.result.insurance : null;
  const insuranceLine = inRound && gs.insuranceBet > 0
    ? (dealerNet
      ? `Insurance ${money(dealerNet.payout - dealerNet.bet, { signed: true })}`
      : `Insurance ${money(gs.insuranceBet)}`)
    : null;
  const components = resultShown ? gs.result.handResults.length + (gs.result.insurance ? 1 : 0) : 0;
  const netTone = resultShown ? (gs.result.net > 0 ? 'good' : gs.result.net < 0 ? 'bad' : 'neutral') : null;

  const placeholderHand = (
    <div className="bj-hand-col" data-empty>
      <div className="bj-hand-space" aria-hidden="true" />
      <div className="bj-pill-slot" />
      <BetCircle
        amount={bet}
        interactive={mode === 'betting' && isInitialized}
        chipValue={chip}
        flights={flights}
        onPlace={() => addChip()}
        onEnter={() => dealRound(bet)}
        hint={bet === 0}
        round={round}
        enterFromRack={enterFromRack}
        label="Bet"
      />
    </div>
  );

  return (
    <div className="bj-table" data-size={cardSize} data-mode={inRound ? 'round' : 'betting'}>
      <WinCelebration
        show={resultShown && gs.result.net > 0}
        payout={resultShown ? gs.result.payout : 0}
      />

      <Felt variant="blackjack" className="bj-felt">
        <Shoe penetration={penetration} />
        <div
          className="bj-stage"
          onPointerDown={inRound && !resultShown && gs.gameState !== 'player-turn' ? skip : undefined}
        >
          {/* Dealer */}
          <section className="bj-dealer" aria-label="Dealer">
            <div className="bj-hand-space" data-dealer>
              {dealerCards.length > 0 && (
                <Hand
                  key={`d${round}`}
                  cards={dealerCards}
                  size={cardSize}
                  dealDelay={pres.fresh ? 0.15 : 0.05 - 0.3 * (dealerCards.length - 1)}
                />
              )}
            </div>
            <div className="bj-pill-slot">
              {dealerPill && (
                <Pill label={`Dealer ${dealerPill.aria}`} tone={dealerPill.kind === 'bust' ? 'bust' : undefined}>
                  {dealerPill.text}
                </Pill>
              )}
              {insuranceLine && <Pill className="bj-pill-quiet">{insuranceLine}</Pill>}
            </div>
          </section>

          {/* Printed felt */}
          <div className="bj-print-block" data-total={resultShown && components > 1 ? 'true' : undefined}>
            {resultShown && components > 1 ? (
              <div className="bj-total-wrap">
                <Pill className="bj-total" tone={netTone} label={`Total ${money(gs.result.net, { signed: true })}`}>
                  <span>Total</span> <b>{money(gs.result.net, { signed: true })}</b>
                </Pill>
              </div>
            ) : null}
            <p className="felt-print bj-print-main">{printLines[0]}</p>
            <p className="felt-print bj-print-sub">{printLines[1]}</p>
            <p className="felt-print bj-print-sub">Insurance pays 2 to 1</p>
            <div className="bj-chat"><DealerChat game="blackjack" event={dealerEvent} /></div>
          </div>

          {/* Player */}
          <section className="bj-player" aria-label="Your hands" data-count={Math.max(1, hands.length)}>
            {!inRound && placeholderHand}
            {inRound && hands.map((h, i) => {
              const pill = pillFor(h);
              const hr = handResults?.[i];
              const desc = describeHand(hr);
              const isActive = gs.gameState === 'player-turn' && gs.currentHandIndex === i && pres.landed;
              const multi = hands.length > 1;
              const outcome = hr ? (hr.outcome === 'win' || hr.outcome === 'blackjack' ? 'win' : hr.outcome === 'push' ? 'push' : 'loss') : null;
              const winnings = hr && outcome === 'win' ? Math.round((hr.payout - hr.bet) * 100) / 100 : 0;
              const len = h.cards.length;
              return (
                <div key={`${round}-${i}`} className="bj-hand-col" data-active={isActive || undefined} data-multi={multi || undefined}>
                  <span className="bj-hand-name t-micro" data-on={isActive || undefined} aria-hidden={multi ? undefined : 'true'}>
                    {multi ? (isActive ? `Hand ${i + 1} · Playing` : `Hand ${i + 1}`) : ''}
                  </span>
                  <div className="bj-hand-space" data-doubled={h.flags.doubled && len >= 3 ? 'true' : undefined}>
                    <Hand
                      cards={h.cards}
                      size={cardSize}
                      status={resultShown && outcome === 'win' ? (hr.outcome === 'blackjack' ? 'blackjack' : 'win') : null}
                      dealDelay={pres.fresh ? 0 : 0.05 - 0.3 * (len - 1) + (multi && !h.flags.doubled && len === 2 ? i * 0.25 : 0)}
                    />
                  </div>
                  <div className="bj-pill-slot">
                    {desc ? (
                      <Pill className="bj-result" tone={desc.tone} label={`${pill ? `${pill.aria}, ` : ''}${desc.word}${desc.showAmount ? ` ${money(desc.net, { signed: true })}` : ''}`}>
                        {pill && pill.kind !== 'bust' && pill.kind !== 'blackjack' && <span className="bj-result-val">{pill.text}</span>}
                        <span className="bj-result-word">{desc.word}</span>
                        {desc.showAmount && <b className="bj-result-amt">{money(desc.net, { signed: true })}</b>}
                      </Pill>
                    ) : pill ? (
                      <Pill active={isActive} label={pill.aria} tone={pill.kind === 'bust' ? 'bust' : undefined}>{pill.text}</Pill>
                    ) : null}
                  </div>
                  <BetCircle
                    amount={h.bet}
                    chipValue={chip}
                    outcome={outcome}
                    payout={winnings}
                    collected={pres.collected}
                    round={round}
                    enterFromRack={enterFromRack}
                    label={multi ? `Hand ${i + 1} bet` : 'Bet'}
                  />
                </div>
              );
            })}
          </section>
        </div>
      </Felt>

      <ControlDock
        mode={dockMode}
        chips={CHIP_VALUES}
        chip={chip}
        onChip={setChip}
        balance={balance}
        bet={bet}
        lastBet={lastBet}
        canRebet={lastBet > 0 && lastBet <= balance}
        onUndo={undoChip}
        onClear={clearBet}
        onRebet={rebet}
        onDouble2={doubleBet}
        onDeal={() => dealRound(bet)}
        disabled={!canAct && dockMode === 'play'}
        canHit={!!gs?.canHit}
        canDouble={!!gs?.canDoubleDown && affordDouble}
        doubleReason={doubleReason}
        canSplit={!!gs?.canSplit && affordDouble}
        splitReason={splitReason}
        canSurrender={!!gs?.canSurrender && pres.landed}
        onHit={onHit}
        onStand={onStand}
        onDoubleDown={onDouble}
        onSplit={onSplit}
        onSurrender={onSurrender}
        insurance={insuranceInfo}
        onInsurance={onInsurance}
        onNewBet={newBet}
        onDealAgain={dealAgain}
        dealAgainReason={lastBet > balance ? 'Not enough balance' : null}
      />
    </div>
  );
};

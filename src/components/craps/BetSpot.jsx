import { memo, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { ChipStack } from '../ui/Chip';
import { formatMoney } from '../ui/RollingNumber';

export const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/** Chips leave the felt toward the dealer when lost, toward the player when collected. */
const STACK_VARIANTS = {
  exit: (kind) => {
    if (kind === 'lose') return { y: -34, x: 0, opacity: 0, scale: 0.92, transition: { duration: 0.42, ease: [0.5, 0, 0.75, 0] } };
    if (kind === 'win' || kind === 'push') return { y: 30, opacity: 0, scale: 0.96, transition: { duration: 0.4, ease: [0.5, 0, 0.75, 0], delay: 0.5 } };
    return { opacity: 0, scale: 0.8, transition: { duration: 0.16 } };
  },
};

/**
 * One tappable place on the layout.
 *   tap          place the selected chip
 *   right-click  take the bet down (also long-press 500ms on touch, Delete from the keyboard)
 *   contract bets show a lock and explain themselves when taken down
 */
export const BetSpot = memo(({
  id,
  label,
  amount = 0,
  className = '',
  children,
  mark, // { result: 'win'|'lose'|'push', profit }
  blockedReason = null, // why placing is not possible right now (spot stays focusable and explains)
  locked = false,
  off = false, // bet is not working (place / hardways on the come-out)
  busy = false,
  extraLabel = '',
  stackSize = 'xs',
  chipsClass = '',
  hidden = false,
  hint = null, // small print under the amount
  layoutId,
  onPlace,
  onRemove,
  onFocusSpot,
}) => {
  const timer = useRef(0);
  const start = useRef(null);
  const fired = useRef(false);
  const pointerType = useRef('mouse');
  const btn = useRef(null);
  const hasBet = amount > 0;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = 0;
    start.current = null;
    btn.current?.removeAttribute('data-pressing');
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = (e) => {
    pointerType.current = e.pointerType || 'mouse';
    fired.current = false;
    if (busy || !hasBet || e.button > 0) return;
    if (e.pointerType === 'mouse') return; // mouse uses right-click
    start.current = { x: e.clientX, y: e.clientY };
    btn.current?.setAttribute('data-pressing', '');
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      fired.current = true;
      btn.current?.removeAttribute('data-pressing');
      onRemove?.(id);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e) => {
    if (!start.current) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) cancel();
  };

  const onClick = (e) => {
    if (fired.current) { fired.current = false; e.preventDefault(); return; }
    cancel();
    if (busy) return;
    onPlace?.(id);
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    if (pointerType.current === 'touch' || pointerType.current === 'pen') return; // the long press handles it
    if (busy) return;
    onRemove?.(id);
  };

  const onKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onRemove?.(id);
    }
  };

  const aria = `${label}, ${hasBet ? `${formatMoney(amount)} bet` : 'no bet'}${extraLabel ? `, ${extraLabel}` : ''}${locked ? ', locked' : ''}${off ? ', off' : ''}`;

  return (
    <div
      className={`cr-spot ${className}`}
      data-spot={id}
      data-has-bet={hasBet || undefined}
      data-result={mark?.result || undefined}
      data-blocked={blockedReason ? '' : undefined}
      data-busy={busy || undefined}
      data-off={off || undefined}
      hidden={hidden || undefined}
    >
      <button
        ref={btn}
        type="button"
        className="cr-hit"
        aria-label={aria}
        aria-disabled={busy || !!blockedReason || undefined}
        aria-describedby="cr-spot-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onFocus={onFocusSpot}
      >
        <span className="cr-art">{children}</span>
        <span className="cr-pressbar" aria-hidden="true" />
      </button>

      <div className={`cr-chips ${chipsClass}`} aria-hidden="true">
        <AnimatePresence initial={false} custom={mark?.result}>
          {hasBet && (
            <motion.div
              key="stack"
              className="cr-stack"
              custom={mark?.result}
              variants={STACK_VARIANTS}
              exit="exit"
              layoutId={layoutId}
              layout={layoutId ? 'position' : false}
            >
              <ChipStack amount={amount} size={stackSize} showLabel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {mark?.result === 'win' && mark.profit > 0 && (
          <motion.div
            key="payout"
            className="cr-payout"
            initial={{ opacity: 0, y: -28, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 26 } }}
            exit={{ opacity: 0, y: 22, transition: { duration: 0.34, ease: [0.5, 0, 0.75, 0] } }}
          >
            <ChipStack amount={mark.profit} size="xs" showLabel={false} />
            <span className="cr-payout-label tnum">{formatMoney(mark.profit, { signed: true })}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {hasBet && locked && (
        <span className="cr-lock" aria-hidden="true"><Lock size={11} strokeWidth={2} /></span>
      )}
      {hasBet && off && <span className="cr-off" aria-hidden="true">Off</span>}
      {hint && <span className="cr-hint" aria-hidden="true">{hint}</span>}
    </div>
  );
});
BetSpot.displayName = 'BetSpot';

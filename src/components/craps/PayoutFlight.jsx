import { memo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Chip } from '../ui/Chip';

const DENOMS = [500, 100, 25, 5, 1];
const MAX_CHIPS = 3;

/** A few chips that stand for an amount, biggest denominations first. */
const chipsFor = (amount) => {
  const out = [];
  let rest = amount;
  DENOMS.forEach((d) => {
    while (rest >= d && out.length < MAX_CHIPS) { out.push(d); rest -= d; }
  });
  return out.length ? out : [1];
};

/**
 * Winnings travelling from the spots that paid to the balance pill in the top bar.
 * `flights` = [{ id, amount, from: {x, y}, dx, dy }] in viewport pixels; `onLand(flight)`
 * fires when a spot's last chip arrives (the pill then counts the amount in).
 */
export const PayoutFlight = memo(({ flights, onLand }) => createPortal(
  <div className="cr-flights" aria-hidden="true">
    {flights.flatMap((f, fi) => {
      const chips = chipsFor(f.amount);
      return chips.map((value, ci) => (
        <motion.div
          key={`${f.key}-${ci}`}
          className="cr-flight"
          style={{ left: f.from.x, top: f.from.y }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
          animate={{
            x: [0, f.dx * 0.3, f.dx],
            y: [0, f.dy * 0.3 - 36, f.dy],
            scale: [1, 1.06, 0.55],
            opacity: [1, 1, 0.9],
          }}
          transition={{
            duration: 0.72,
            delay: 0.4 + fi * 0.12 + ci * 0.06, // the "+$7" shows first, then the chips leave
            times: [0, 0.32, 1],
            ease: [0.45, 0, 0.25, 1],
          }}
          onAnimationComplete={ci === chips.length - 1 ? () => onLand(f) : undefined}
        >
          <Chip value={value} size="sm" />
        </motion.div>
      ));
    })}
  </div>,
  document.body,
));
PayoutFlight.displayName = 'PayoutFlight';

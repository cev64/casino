import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chip, ChipStack } from '../ui/Chip';

const FLIGHT_MS = 240;

/**
 * The printed betting circle. In the betting phase it is a button: tap to place the selected chip.
 * The bet shows as a chip stack in the ring. Chips fly in from the rack (below) when added, fly back
 * when removed. At the end of a round: lost chips are swept toward the dealer, won chips arrive from
 * the dealer side next to the stake, then everything is pulled back toward the rack.
 *
 * flights: [{ id, value, dir: 'in' | 'out' }]  (owned by the table)
 */
export const BetCircle = memo(({
  amount = 0,
  interactive = false,
  chipValue = 25,
  flights = [],
  outcome = null, // 'win' | 'loss' | 'push' | null (only once the result is shown)
  payout = 0, // winnings paid on top of the stake (shown as a second stack)
  collected = false, // winners and pushes have been pulled back
  onPlace,
  onEnter,
  label = 'Bet',
  size = 'sm',
  hint = false,
  round = 0,
  enterFromRack = false,
}) => {
  // The stack lands after the flying chip does
  const [shown, setShown] = useState(amount);
  const prev = useRef(amount);
  useEffect(() => {
    if (amount > prev.current) {
      const t = setTimeout(() => setShown(amount), FLIGHT_MS - 40);
      prev.current = amount;
      return () => clearTimeout(t);
    }
    prev.current = amount;
    setShown(amount);
    return undefined;
  }, [amount]);

  const lost = outcome === 'loss';
  const pulled = collected && !lost;

  const stackAnim = lost
    ? { y: -170, x: 10, opacity: 0, transition: { duration: 0.7, ease: [0.4, 0, 0.2, 1], delay: 0.15 } }
    : pulled
      ? { y: 190, opacity: 0, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }
      : { y: 0, x: 0, opacity: 1, transition: { duration: 0.2 } };

  return (
    <div className="bj-circle-wrap" data-size={size}>
      <button
        type="button"
        className="bj-circle"
        data-interactive={interactive || undefined}
        data-hint={hint || undefined}
        disabled={!interactive}
        aria-label={interactive ? `Place a $${chipValue} chip on the betting circle` : `${label}${amount ? `, $${amount}` : ''}`}
        onClick={interactive ? onPlace : undefined}
        onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } } : undefined}
      >
        <span className="felt-ring bj-circle-ring" aria-hidden="true" />
        {!amount && interactive && <span className="felt-print bj-print bj-circle-word" aria-hidden="true">Bet</span>}
      </button>

      <div className="bj-circle-chips" aria-hidden={amount ? undefined : 'true'}>
        <AnimatePresence initial={false}>
          {shown > 0 && (
            <motion.div
              key={`stake-${round}`}
              className="bj-stake"
              initial={enterFromRack ? { opacity: 0, y: 150 } : { opacity: 0, y: 0 }}
              animate={stackAnim}
              exit={{ y: 150, opacity: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
            >
              <ChipStack amount={shown} size="sm" showLabel />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Winnings arrive from the dealer side */}
        <AnimatePresence initial={false}>
          {outcome === 'win' && payout > 0 && (
            <span className="bj-payout-pos" key={`payout-${round}`}>
              <motion.div
                className="bj-payout"
                initial={{ y: -190, opacity: 0 }}
                animate={collected
                  ? { y: 190, opacity: 0, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }
                  : { y: 0, opacity: 1, transition: { type: 'spring', duration: 0.6, bounce: 0.18 } }}
              >
                <ChipStack amount={payout} size="sm" showLabel={false} />
              </motion.div>
            </span>
          )}
        </AnimatePresence>

        {/* Chip in flight between the rack and the ring */}
        {flights.map((f) => (
          <motion.span
            key={f.id}
            className="bj-flight"
            initial={f.dir === 'in' ? { y: 170, scale: 1.25, opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
            animate={f.dir === 'in'
              ? { y: -6, scale: 1, opacity: [1, 1, 0], transition: { duration: FLIGHT_MS / 1000, ease: [0.22, 1, 0.36, 1], opacity: { times: [0, 0.8, 1], duration: FLIGHT_MS / 1000 } } }
              : { y: 170, scale: 1.2, opacity: [1, 1, 0], transition: { duration: FLIGHT_MS / 1000, ease: [0.4, 0, 0.2, 1] } }}
          >
            <Chip value={f.value} size="sm" />
          </motion.span>
        ))}
      </div>
    </div>
  );
});

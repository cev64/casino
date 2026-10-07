import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Dealer line: one short, factual sentence in a small glass bubble.
 * `event` is a key below, optionally with a value after a colon ("pointSet:6" -> "Point is 6.").
 * Unknown keys render nothing, so tables can pass new events safely.
 */
const LINES = {
  blackjack: {
    deal: 'Cards out.',
    shuffle: 'Shuffling.',
    hit: 'Card.',
    stand: 'Stand.',
    doubleDown: 'Double down.',
    split: 'Split.',
    insurance: 'Insurance offered.',
    surrender: 'Surrender. Half the bet returns.',
    playerBlackjack: 'Blackjack. Pays 3 to 2.',
    dealerBlackjack: 'Dealer has blackjack.',
    dealerBust: 'Dealer busts.',
    bust: 'Bust.',
    win: 'You win.',
    bigWin: 'You win.',
    lose: 'Dealer wins.',
    push: 'Push.',
  },
  craps: {
    comeOut: 'Come out roll.',
    roll: 'Dice out.',
    pointSet: (n) => (n ? `Point is ${n}.` : 'Point is set.'),
    pointMade: (n) => (n ? `Point ${n} made.` : 'Point made.'),
    seven: 'Seven.',
    sevenOut: 'Seven out.',
    hardway: (n) => (n ? `Hard ${n}.` : 'Hardway.'),
    craps: 'Craps.',
    yo: 'Eleven.',
    fieldWin: 'Field wins.',
    bigWin: 'You win.',
  },
};

const resolveLine = (game, event) => {
  if (!event) return null;
  const [key, arg] = String(event).split(':');
  const line = LINES[game]?.[key];
  if (!line) return null;
  return typeof line === 'function' ? line(arg) : line;
};

const SHOW_DELAY_MS = 180;
const HOLD_MS = 2600;

export const DealerChat = ({ game, event, visible = true }) => {
  const [message, setMessage] = useState(null);
  const [tick, setTick] = useState(0);

  const eventRef = useRef(null);
  useEffect(() => {
    if (!visible || !event || eventRef.current === event) return undefined;
    eventRef.current = event;
    const line = resolveLine(game, event);
    if (!line) return undefined;

    const showTimer = setTimeout(() => {
      setMessage(line);
      setTick((t) => t + 1);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(showTimer);
  }, [event, game, visible]);

  // Hide after a hold; a new line (tick) restarts the timer.
  useEffect(() => {
    if (!message) return undefined;
    const hideTimer = setTimeout(() => {
      setMessage(null);
      eventRef.current = null; // the same event may speak again later
    }, HOLD_MS);
    return () => clearTimeout(hideTimer);
  }, [message, tick]);

  return (
    <div className="dealer-chat flex items-center justify-center min-h-9" role="status" aria-live="polite">
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={`${tick}-${message}`}
            className="glass inline-flex items-center h-9 px-4 rounded-full text-[14px] leading-5 font-medium text-ink whitespace-nowrap select-none"
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.35, ease: [0.34, 1.4, 0.64, 1] } }}
            exit={{ opacity: 0, scale: 0.96, y: 2, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

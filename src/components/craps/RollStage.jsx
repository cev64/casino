import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DicePair } from '../ui/Dice';
import { formatMoney } from '../ui/RollingNumber';

/**
 * The dice land here (a patch of open felt), and the calm result line sits beside them.
 * The shooter throws from the bottom right toward the back wall (the number boxes) and the
 * dice settle on the way back.
 */
export const RollStage = memo(({ dice, rolling, summary }) => {
  const status = summary?.status;
  return (
    <div className="cr-stage" data-rolling={rolling || undefined}>
      <AnimatePresence mode="wait">
        {summary && (
          <motion.div
            key={summary.key}
            className="cr-result glass"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.34, 1.4, 0.64, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
          >
            <span className="cr-result-total tnum">{summary.total}</span>
            <span className="cr-result-text">
              <span className="cr-result-title">{summary.title}</span>
              {status && (
                <span className="cr-result-net tnum" data-tone={summary.net > 0 ? 'good' : summary.net < 0 ? 'bad' : undefined}>
                  <span>{status}</span>
                  {summary.net !== 0 && <span>{formatMoney(summary.net, { signed: true })}</span>}
                </span>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {dice && (
        <motion.div
          key={dice.key}
          className="cr-dice"
          initial={{ x: 150, y: 120, opacity: 0, scale: 0.8 }}
          animate={{
            x: [150, 60, 14, 4, 0],
            y: [120, -52, 6, -5, 0],
            opacity: [0, 1, 1, 1, 1],
            scale: [0.8, 1, 1, 1, 1],
          }}
          transition={{ duration: 1.0, times: [0, 0.42, 0.7, 0.86, 1], ease: 'easeOut' }}
        >
          <DicePair die1={dice.die1} die2={dice.die2} isRolling={rolling} showTotal={false} />
        </motion.div>
      )}
    </div>
  );
});
RollStage.displayName = 'RollStage';

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const TAG = {
  sevenOut: { text: 'Out', word: 'seven out' },
  pointMade: { text: 'Hit', word: 'point made' },
  pointEstablished: { text: 'Pt', word: 'point set' },
};

const MAX = 12;

/** The last rolls, newest first. Seven outs and point hits carry a word, not just a colour. */
export const RollHistory = memo(({ rolls }) => {
  const recent = rolls.slice(-MAX).reverse();
  return (
    <div className="cr-history" role="group" aria-label="Recent rolls">
      {recent.length === 0 ? (
        <span className="cr-history-empty">No rolls yet</span>
      ) : (
        <ol className="cr-history-list">
          <AnimatePresence initial={false}>
            {recent.map((r, i) => {
              const tag = TAG[r.event];
              const num = rolls.length - i;
              return (
                <motion.li
                  key={num}
                  layout="position"
                  className="cr-roll"
                  data-event={r.event || undefined}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.34, 1.4, 0.64, 1] }}
                  aria-label={`${r.total}${r.die1 === r.die2 ? ' (doubles)' : ''}${tag ? `, ${tag.word}` : ''}`}
                >
                  <span className="cr-roll-total tnum">{r.total}</span>
                  <span className="cr-roll-tag" aria-hidden="true">{tag ? tag.text : ' '}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
});
RollHistory.displayName = 'RollHistory';

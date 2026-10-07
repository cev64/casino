import { memo, useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

/*
 * Craps puck: thick plastic disc. ON = white face / black text, OFF = black face / white text.
 * Turning over is a small hop with a true 3D flip.
 * `point` (alias: legacy `position`) is shown small under "ON" at size md.
 */
export const DealerPuck = memo(({ isOn = false, point = null, position = null, size = 'md', className = '' }) => {
  const pt = point ?? position;
  const hop = useAnimationControls();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    hop.start({
      y: [0, -12, 0],
      scale: [1, 1.1, 1],
      transition: { duration: 0.55, times: [0, 0.45, 1], ease: 'easeInOut' },
    });
  }, [isOn, hop]);

  const label = isOn ? `Puck on${pt ? `, point ${pt}` : ''}` : 'Puck off';

  return (
    <motion.div
      className={`puck ${size === 'sm' ? 'puck-sm' : 'puck-md'} ${className}`}
      animate={hop}
      role="img"
      aria-label={label}
      data-on={isOn || undefined}
    >
      <span className="puck-shadow" aria-hidden="true" />
      <motion.div
        className="puck-flip"
        initial={false}
        animate={{ rotateX: isOn ? 0 : 180 }}
        transition={{ duration: 0.55, ease: [0.45, 0, 0.2, 1] }}
      >
        <div className="puck-face puck-on" aria-hidden="true">
          <span className="puck-word">ON</span>
          {pt ? <span className="puck-num tnum">{pt}</span> : null}
        </div>
        <div className="puck-face puck-off" aria-hidden="true">
          <span className="puck-word">OFF</span>
        </div>
      </motion.div>
    </motion.div>
  );
});

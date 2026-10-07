import { memo } from 'react';

const PIPS = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[32, 27], [68, 27], [32, 50], [68, 50], [32, 73], [68, 73]],
};

/** Two outlined dice as screen-printed on the felt (flat, cream ink). */
export const PrintedDice = memo(({ a = 6, b = 6, className = '' }) => (
  <svg viewBox="0 0 230 100" className={`cr-pdice ${className}`} aria-hidden="true" focusable="false">
    {[a, b].map((v, i) => (
      <g key={i} transform={`translate(${i * 130} 0)`}>
        <rect x="3" y="3" width="94" height="94" rx="18" fill="none" stroke="currentColor" strokeWidth="6" />
        {PIPS[v].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="8.5" fill="currentColor" />
        ))}
      </g>
    ))}
  </svg>
));
PrintedDice.displayName = 'PrintedDice';

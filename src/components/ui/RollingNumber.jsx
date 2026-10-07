import { useEffect, useRef, useState } from 'react';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Money formatting with a real minus sign (U+2212) and optional explicit plus. */
export const formatMoney = (n, { signed = false, cents = false } = {}) => {
  // Whole dollars unless asked for cents or the amount has a fraction (3:2 on an odd bet) — then always 2 places.
  const showCents = cents || Math.round(Math.abs(n) * 100) % 100 !== 0;
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  if (n < 0) return `−$${abs}`;
  if (signed && n > 0) return `+$${abs}`;
  return `$${abs}`;
};

/**
 * Number that rolls to its new value over 380ms (ease). No roll on first paint
 * or under reduced motion. Always tabular figures.
 */
export const RollingNumber = ({ value, format = formatMoney, className = '', duration = 380 }) => {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    if (from.current === value) return undefined;
    if (prefersReduced()) { from.current = value; setDisplay(value); return undefined; }
    const start = performance.now();
    const a = display;
    const b = value;
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (b - a) * ease(t);
      // Roll in whole dollars, land on the exact value
      setDisplay(t >= 1 ? b : Math.round(v));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    from.current = value;
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className={`tnum ${className}`}>{format(display)}</span>;
};

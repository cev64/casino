import { memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMoney } from './RollingNumber';

/*
 * Clay casino chips. Colours/materials live in objects.css (.chip, data-d).
 *   <Chip value size="xs|sm|md|lg" selected onClick />      single chip, seen from above
 *   <ChipStack amount size="xs|sm|md" showLabel />           side-ish view, greedy denominations
 *   <ChipRack values selected onSelect balance />            glass tray, radiogroup
 *   <ChipSelector selectedChip onSelectChip />               legacy alias
 */

export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000];
const STACK_DENOMS = [1000, 500, 100, 25, 10, 5, 1];

const tier = (v) => {
  if (v >= 1000) return 1000;
  if (v >= 500) return 500;
  if (v >= 100) return 100;
  if (v >= 25) return 25;
  if (v >= 10) return 10;
  if (v >= 5) return 5;
  return 1;
};

const chipText = (v) => {
  if (v >= 10000) return `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}K`;
  if (v >= 1000 && v % 1000 === 0) return `${v / 1000}K`;
  return String(v);
};

const textSize = (s) => (s.length <= 1 ? 31 : s.length === 2 ? 27 : s.length === 3 ? 21 : 17);

/* ---------- geometry ---------- */

const SPOT_ANGLES = Array.from({ length: 8 }, (_, k) => 22.5 + 45 * k);

/** Top view, drawn in a -50..50 box. */
const ChipTop = ({ text, showText = true }) => (
  <g>
    <circle r="50" className="c-base" />
    {SPOT_ANGLES.map((a) => (
      <rect key={a} x="-6.6" y="-50" width="13.2" height="11.6" rx="1.8" className="c-spot" transform={`rotate(${a})`} />
    ))}
    <circle r="49.3" fill="none" stroke="#000" strokeOpacity=".22" strokeWidth=".9" />
    <circle r="36" fill="none" className="c-spot-stroke" strokeWidth="1.5" />
    <circle r="27.5" className="c-inlay" />
    <circle r="27.5" fill="none" stroke="#000" strokeOpacity=".16" strokeWidth=".8" />
    <circle r="24.6" fill="none" className="c-base-stroke" strokeWidth=".8" strokeOpacity=".55" />
    {showText && (
      <text
        x="0" y="0" dy=".355em" textAnchor="middle" className="c-ink"
        fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
        fontSize={textSize(text)} letterSpacing={text.length > 2 ? '-1' : '-0.5'}
      >{text}</text>
    )}
  </g>
);

/** Edge stripes of the front half of a cylinder: viewBox 0 0 100 46 (ellipse ry 17, thickness 12). */
const EDGE_STRIPES = (() => {
  const pt = (phi, drop) => {
    const r = (phi * Math.PI) / 180;
    return [50 + 50 * Math.cos(r), 17 + 17 * Math.sin(r) + drop];
  };
  const half = 7.4;
  return SPOT_ANGLES.filter((a) => a > 0 && a < 180).map((a) => {
    const steps = 4;
    const top = [];
    const bot = [];
    for (let i = 0; i <= steps; i += 1) {
      const phi = a - half + (2 * half * i) / steps;
      top.push(pt(phi, 0));
      bot.push(pt(phi, 12));
    }
    const pts = [...top, ...bot.reverse()];
    return `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;
  }).join('');
})();

const SideChip = ({ text, showTop }) => (
  <svg viewBox="0 0 100 46" className="cs-svg" aria-hidden="true" focusable="false">
    <path d="M0 17 V29 A50 17 0 0 0 100 29 V17 Z" className="c-edge" />
    <path d={EDGE_STRIPES} className="c-spot" />
    <path d="M0 17 V29 A50 17 0 0 0 100 29 V17" fill="none" stroke="#000" strokeOpacity=".28" strokeWidth=".8" />
    <path d="M0 17 V29 A50 17 0 0 0 100 29 V17 Z" fill="#000" fillOpacity=".12" />
    <g transform="translate(50 17) scale(1 .34)">
      <ChipTop text={text} showText={showTop} />
    </g>
  </svg>
);

/* ---------- Chip ---------- */

const SIZE_CLASS = { xs: 'chip-xs', sm: 'chip-sm', md: 'chip-md', lg: 'chip-lg', rack: 'chip-rack-size' };

export const Chip = memo(({
  value, size = 'md', selected = false, onClick, disabled = false, className = '', style, ...rest
}) => {
  const text = chipText(value);
  const Tag = onClick ? 'button' : 'span';
  const extra = onClick ? { type: 'button', onClick, disabled } : {};
  return (
    <Tag
      className={`chip ${SIZE_CLASS[size] || SIZE_CLASS.md} ${onClick ? 'chip-btn pressable' : ''} ${className}`}
      data-d={tier(value)}
      data-selected={selected || undefined}
      aria-label={onClick ? `$${value.toLocaleString('en-US')} chip` : undefined}
      aria-pressed={onClick ? selected : undefined}
      style={style}
      {...extra}
      {...rest}
    >
      <svg viewBox="-50 -50 100 100" className="chip-svg" aria-hidden="true" focusable="false">
        <ChipTop text={text} />
      </svg>
    </Tag>
  );
});

/* ---------- ChipStack ---------- */

const decompose = (amount) => {
  let rest = Math.max(0, Math.round(amount));
  const out = [];
  STACK_DENOMS.forEach((d) => {
    const n = Math.floor(rest / d);
    if (n > 0) { out.push({ d, n }); rest -= n * d; }
  });
  return out;
};

const VISIBLE_CAP = 10;
const MAX_COLS = 4;

const visibleColumns = (amount) => {
  const cols = decompose(amount).slice(0, MAX_COLS).map((c) => ({ ...c }));
  let total = cols.reduce((s, c) => s + c.n, 0);
  while (total > VISIBLE_CAP) {
    let big = cols[0];
    cols.forEach((c) => { if (c.n > big.n) big = c; });
    if (big.n <= 1) break;
    big.n -= 1; total -= 1;
  }
  return cols;
};

const STACK_SIZE = { xs: 'cs-xs', sm: 'cs-sm', md: 'cs-md' };

export const ChipStack = memo(({ amount, size = 'md', showLabel = true, className = '', style }) => {
  const cols = visibleColumns(amount);
  if (!amount || amount <= 0 || cols.length === 0) return null;
  return (
    <div
      className={`cs ${STACK_SIZE[size] || STACK_SIZE.md} ${className}`}
      style={style}
      role="img"
      aria-label={`${formatMoney(amount)} in chips`}
    >
      <div className="cs-cols">
        {cols.map((col, ci) => (
          <div
            key={col.d}
            className="cs-col"
            data-d={col.d}
            style={{ '--n': col.n, '--odd': ci % 2 }}
          >
            <AnimatePresence initial>
              {Array.from({ length: col.n }).map((_, i) => (
                <motion.span
                  key={`${col.d}-${i}`}
                  className="cs-chip"
                  data-d={col.d}
                  style={{ '--i': i }}
                  initial={{ y: '-130%', opacity: 0 }}
                  animate={{ y: '0%', opacity: 1 }}
                  exit={{ y: '-40%', opacity: 0, transition: { duration: 0.14 } }}
                  transition={{
                    delay: Math.min(i * 0.04, 0.3),
                    y: { type: 'spring', stiffness: 520, damping: 15, mass: 0.8 },
                    opacity: { duration: 0.1, delay: Math.min(i * 0.04, 0.3) },
                  }}
                >
                  <SideChip text={chipText(col.d)} showTop={i === col.n - 1} />
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
      {showLabel && <span className="cs-label tnum">{formatMoney(amount)}</span>}
    </div>
  );
});

/* ---------- ChipRack ---------- */

export const ChipRack = memo(({
  values = CHIP_VALUES, selected, onSelect, balance, label = 'Chip value', className = '', disabled = false,
}) => {
  const refs = useRef([]);
  const isDisabled = (v) => disabled || (typeof balance === 'number' && v > balance);
  const selIndex = values.indexOf(selected);
  const firstEnabled = values.findIndex((v) => !isDisabled(v));
  const tabbable = selIndex >= 0 && !isDisabled(values[selIndex]) ? selIndex : firstEnabled;

  const move = (from, dir) => {
    let i = from;
    for (let k = 0; k < values.length; k += 1) {
      i = (i + dir + values.length) % values.length;
      if (!isDisabled(values[i])) {
        onSelect?.(values[i]);
        refs.current[i]?.focus();
        return;
      }
    }
  };

  const onKeyDown = (e, i) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
    else if (e.key === 'Home') { e.preventDefault(); move(-1, 1); }
    else if (e.key === 'End') { e.preventDefault(); move(values.length, -1); }
  };

  return (
    <div className={`chip-rack glass ${className}`} role="radiogroup" aria-label={label}>
      <div className="chip-rack-row">
        {values.map((v, i) => {
          const off = isDisabled(v);
          const on = v === selected;
          return (
            <button
              key={v}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`$${v.toLocaleString('en-US')} chip`}
              disabled={off}
              tabIndex={i === tabbable ? 0 : -1}
              className="chip-slot"
              data-selected={on || undefined}
              onClick={() => onSelect?.(v)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <Chip value={v} size="rack" selected={on} />
            </button>
          );
        })}
      </div>
    </div>
  );
});

export const ChipSelector = ({ selectedChip, onSelectChip, balance, values, className }) => (
  <ChipRack
    values={values || CHIP_VALUES}
    selected={selectedChip}
    onSelect={onSelectChip}
    balance={balance}
    className={className}
  />
);

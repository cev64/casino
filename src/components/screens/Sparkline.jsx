import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../ui/RollingNumber';

const H = 96;
const PAD_Y = 10;

/** Monotone cubic path through points (no overshoot between samples). */
const monotonePath = (pts) => {
  const n = pts.length;
  if (n < 2) return '';
  const dx = []; const m = []; const t = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / (dx[i] || 1);
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    d += ` C${c1x.toFixed(2)},${(pts[i].y + (t[i] * dx[i]) / 3).toFixed(2)} ${c2x.toFixed(2)},${(pts[i + 1].y - (t[i + 1] * dx[i]) / 3).toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
};

/**
 * Running net result. Line draws in over 700ms, then the area fades.
 * Pointer / touch scrub shows a hairline, a dot and a glass tooltip.
 * points: [{ value, label }] oldest first.
 */
export const Sparkline = ({ points, label = 'Net result over recent games' }) => {
  const wrapRef = useRef(null);
  const lineRef = useRef(null);
  const [w, setW] = useState(0);
  const [active, setActive] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!w || points.length < 2) return null;
    const vals = points.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const xy = points.map((p, i) => ({
      x: (i / (points.length - 1)) * w,
      y: PAD_Y + (1 - (p.value - min) / span) * (H - PAD_Y * 2),
    }));
    const line = monotonePath(xy);
    return { xy, line, area: `${line} L${w},${H} L0,${H} Z` };
  }, [points, w]);

  useEffect(() => {
    const len = lineRef.current?.getTotalLength?.();
    if (len) lineRef.current.style.setProperty('--len', String(Math.ceil(len)));
  }, [geo]);

  const scrub = (e) => {
    if (!geo || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    setActive(Math.round((x / rect.width) * (points.length - 1)));
  };

  const a = active !== null && geo ? { p: points[active], xy: geo.xy[active] } : null;

  return (
    <div
      ref={wrapRef}
      className="relative touch-pan-y select-none"
      style={{ height: H }}
      role="img"
      aria-label={label}
      onPointerMove={scrub}
      onPointerDown={scrub}
      onPointerLeave={() => setActive(null)}
      onPointerUp={(e) => { if (e.pointerType !== 'mouse') setActive(null); }}
      onPointerCancel={() => setActive(null)}
    >
      {geo && (
        <svg key={points.length} width={w} height={H} className="block overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="spark-area" d={geo.area} fill="url(#spark-fill)" />
          <path
            ref={lineRef}
            className="spark-line"
            d={geo.line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {a && (
            <g>
              <line x1={a.xy.x} x2={a.xy.x} y1="0" y2={H} stroke="var(--ink-3)" strokeOpacity="0.5" strokeWidth="1" />
              <circle cx={a.xy.x} cy={a.xy.y} r="4.5" fill="var(--ink)" stroke="var(--page)" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {a && (
        <div
          className="glass-strong pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-menu px-3 py-1.5 text-center"
          style={{ left: Math.min(Math.max(a.xy.x, 56), Math.max(w - 56, 56)), transform: 'translate(-50%, -100%)' }}
        >
          <div className="text-[15px] leading-5 font-semibold text-ink tnum">{formatMoney(a.p.value, { signed: true })}</div>
          <div className="text-[12px] leading-4 text-ink-3 whitespace-nowrap">{a.p.label}</div>
        </div>
      )}
    </div>
  );
};

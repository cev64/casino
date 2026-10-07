import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/*
 * Real 3D dice (CSS preserve-3d cubes), precision casino red with recessed ivory pips.
 *
 * Face layout (local cube frame, opposite faces sum to 7):
 *   front 1, back 6, right 2, left 5, top 3, bottom 4
 * To show value v we rotate the cube so face v points at the viewer (ORIENT below),
 * then twist it (a random yaw about that face's normal). A fixed "pose" tilt (POSE_X,
 * applied on a parent) turns the value face up toward the viewer, like looking down at a
 * die lying on a table, so the value face is the TOP face and two side faces show.
 *
 * Motion (rAF, transform + opacity only):
 *   isRolling  -> tumble about three axes with decaying hops and some travel
 *   !isRolling -> land: >= 1 extra revolution decelerating onto the exact orientation,
 *                 two small bounces, shadow shrinking/growing with height.
 */

const POSE_X = 32; // value face (front of the cube frame) faces up-and-toward the viewer
const POSE_Y = 0;

const FACES = [
  { key: 'front', v: 1, n: [0, 0, 1] },
  { key: 'back', v: 6, n: [0, 0, -1] },
  { key: 'right', v: 2, n: [1, 0, 0] },
  { key: 'left', v: 5, n: [-1, 0, 0] },
  { key: 'top', v: 3, n: [0, -1, 0] },
  { key: 'bottom', v: 4, n: [0, 1, 0] },
];

// cube rotation (degrees about X, then Y inside rotateX() rotateY()) that brings face v to the front
const ORIENT = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  2: { x: 0, y: -90 },
  5: { x: 0, y: 90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
};

const PIP_POS = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[31, 27], [69, 27], [31, 50], [69, 50], [31, 73], [69, 73]],
};

const DieFace = memo(({ v }) => (
  <svg viewBox="0 0 100 100" className="die-pips" aria-hidden="true" focusable="false">
    {PIP_POS[v].map(([x, y]) => (
      <g key={`${x}-${y}`}>
        <circle cx={x} cy={y} r="10.2" fill="#000" fillOpacity=".5" />
        <circle cx={x} cy={y + 1.1} r="9.1" fill="#F7F2E8" />
        <circle cx={x - 2.2} cy={y - 1} r="3.2" fill="#fff" fillOpacity=".55" />
      </g>
    ))}
  </svg>
));

/* ---------- little rotation maths (CSS conventions: x right, y down, z toward viewer) ---------- */

const rad = (d) => (d * Math.PI) / 180;
const mul = (a, b) => a.map((_, i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));
const RX = (d) => { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const RY = (d) => { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const RZ = (d) => { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const POSE = mul(RX(POSE_X), RY(POSE_Y));
const LIGHT = (() => { const v = [-0.28, -0.8, 0.52]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

const applyShading = (faceEls, x, y, z) => {
  const T = mul(POSE, mul(RZ(z), mul(RX(x), RY(y))));
  FACES.forEach((f, i) => {
    const el = faceEls[i];
    if (!el) return;
    const vx = T[0][0] * f.n[0] + T[0][1] * f.n[1] + T[0][2] * f.n[2];
    const vy = T[1][0] * f.n[0] + T[1][1] * f.n[1] + T[1][2] * f.n[2];
    const vz = T[2][0] * f.n[0] + T[2][1] * f.n[1] + T[2][2] * f.n[2];
    const lam = Math.max(0, vx * LIGHT[0] + vy * LIGHT[1] + vz * LIGHT[2]);
    const shade = Math.max(0, Math.min(0.5, 0.5 * (1 - lam / 0.82)));
    const gloss = Math.max(0, Math.min(0.5, (lam - 0.55) * 1.6)) * (vz > 0 ? 1 : 0);
    el.style.setProperty('--sh', shade.toFixed(3));
    el.style.setProperty('--gl', gloss.toFixed(3));
  });
};

const easeOut3 = (p) => 1 - (1 - p) ** 3;
const rnd = (a, b) => a + Math.random() * (b - a);
const sgn = () => (Math.random() < 0.5 ? -1 : 1);

// first angle >= base (+ minimum travel) that is congruent to target modulo 360
const unwindTo = (current, target, minTravel) => target + 360 * Math.ceil((current + minTravel - target) / 360);

const HOP = 0.62; // hop height as a fraction of the die size

export const Die = memo(({ value = 1, isRolling = false, settleDelay = 0, className = '', onLand }) => {
  const reduce = useReducedMotion();
  const hopRef = useRef(null);
  const cubeRef = useRef(null);
  const shadowRef = useRef(null);
  const faceRefs = useRef([]);
  const s = useRef({
    x: ORIENT[value].x, y: ORIENT[value].y, z: 0, h: 0, tx: 0,
    phase: 'rest', raf: 0, timer: 0, value, twist: rnd(-30, 30), shown: value,
  });
  const valueRef = useRef(value);
  valueRef.current = value;
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;

  const paint = () => {
    const st = s.current;
    const cube = cubeRef.current;
    if (!cube) return;
    cube.style.transform = `rotateZ(${st.z}deg) rotateX(${st.x}deg) rotateY(${st.y}deg)`;
    if (hopRef.current) hopRef.current.style.transform = `translate3d(${st.tx}px, ${-st.h}px, 0)`;
    if (shadowRef.current) {
      const k = Math.min(1, st.h / 60);
      shadowRef.current.style.transform = `translate3d(${st.tx * 0.6}px, 0, 0) scale(${(1 - 0.38 * k).toFixed(3)})`;
      shadowRef.current.style.opacity = (1 - 0.55 * k).toFixed(3);
    }
    applyShading(faceRefs.current, st.x, st.y, st.z);
  };

  const stop = () => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    clearTimeout(st.timer);
    st.raf = 0;
  };

  const sizePx = () => cubeRef.current?.offsetWidth || 56;

  const rest = (v) => {
    const st = s.current;
    stop();
    const o = ORIENT[v];
    st.x = o.x; st.y = o.y; st.z = st.twist; st.h = 0; st.tx = 0;
    st.phase = 'rest'; st.shown = v;
    paint();
  };

  const land = (quick = false) => {
    const st = s.current;
    stop();
    const v = valueRef.current;
    const o = ORIENT[v];
    st.twist = rnd(-32, 32);
    const from = { x: st.x, y: st.y, z: st.z, h: st.h, tx: st.tx };
    const turns = quick ? 360 : 540;
    const to = {
      x: unwindTo(from.x, o.x, turns),
      y: unwindTo(from.y, o.y, turns),
      z: unwindTo(from.z, st.twist, 180),
    };
    const T = quick ? 0.55 : 0.82; // seconds
    const D = sizePx();
    const b1 = HOP * D * (quick ? 0.28 : 0.4);
    const b2 = b1 * 0.3;
    const tFall = Math.max(0.001, from.h > 1 ? 0.14 : 0.001);
    const t1 = tFall + (quick ? 0.2 : 0.26); // end of bounce 1
    const t2 = t1 + 0.14; // end of bounce 2
    st.phase = 'landing';
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      const p = Math.min(1, t / T);
      const e = easeOut3(p);
      st.x = to.x + (from.x - to.x) * (1 - e);
      st.y = to.y + (from.y - to.y) * (1 - e);
      st.z = to.z + (from.z - to.z) * (1 - e);
      st.tx = from.tx * (1 - e) * (1 - e);
      let h = 0;
      if (t < tFall) { const u = t / tFall; h = from.h * (1 - u * u); }
      else if (t < t1) { const u = (t - tFall) / (t1 - tFall); h = b1 * 4 * u * (1 - u); }
      else if (t < t2) { const u = (t - t1) / (t2 - t1); h = b2 * 4 * u * (1 - u); }
      st.h = h;
      if (t >= Math.max(T, t2)) {
        st.raf = 0;
        rest(v);
        onLandRef.current?.(v);
        return;
      }
      paint();
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
  };

  const roll = () => {
    const st = s.current;
    stop();
    st.phase = 'roll';
    const D = sizePx();
    const w = [sgn() * rnd(560, 900), sgn() * rnd(560, 900), sgn() * rnd(300, 620)];
    const f = rnd(2.0, 2.5);
    const phase = rnd(0, 1);
    const trav = sgn() * rnd(0.25, 0.55) * D;
    let last = performance.now();
    const t0 = last;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      st.x += w[0] * dt; st.y += w[1] * dt; st.z += w[2] * dt;
      const amp = HOP * D * (0.2 + 0.8 * Math.exp(-t / 1.1)) * 1.1;
      st.h = amp * Math.abs(Math.sin(Math.PI * (f * t + phase)));
      st.tx = trav * Math.sin(t * 2.2);
      paint();
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
  };

  // initial paint
  useEffect(() => {
    rest(value);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // start / finish a roll
  useEffect(() => {
    const st = s.current;
    if (reduce) { rest(value); return undefined; }
    if (isRolling) {
      roll();
    } else if (st.phase === 'roll') {
      clearTimeout(st.timer);
      st.timer = setTimeout(() => land(false), Math.max(0, settleDelay) * 1000);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRolling, reduce]);

  // value changed
  useEffect(() => {
    const st = s.current;
    if (reduce) { rest(value); return; }
    if (st.phase === 'rest' && !isRolling && st.shown !== value) land(true);
    else if (st.phase === 'landing') land(true);
    // phase 'roll': the pending landing reads valueRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => () => { clearTimeout(s.current.timer); cancelAnimationFrame(s.current.raf); }, []);

  return (
    <div className={`die ${className}`} data-value={value} data-rolling={isRolling || undefined}>
      <span className="die-shadow" ref={shadowRef} aria-hidden="true" />
      <div className="die-hop" ref={hopRef}>
        <div className="die-pose">
          <div className="die-cube" ref={cubeRef} role="img" aria-label={`Die showing ${value}`}>
            {FACES.map((f, i) => (
              <div
                key={f.key}
                className={`die-face die-${f.key}`}
                data-face={f.v}
                ref={(el) => { faceRefs.current[i] = el; }}
              >
                <DieFace v={f.v} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export const DicePair = memo(({ die1 = 1, die2 = 1, isRolling = false, showTotal = true, className = '' }) => {
  const a = Number(die1) || 1;
  const b = Number(die2) || 1;
  return (
    <div className={`dice-pair ${className}`}>
      <div className="dice-row">
        <Die value={a} isRolling={isRolling} settleDelay={0} />
        <Die value={b} isRolling={isRolling} settleDelay={0.12} />
      </div>
      {showTotal && (
        <span
          className="dice-total glass tnum"
          data-hidden={isRolling || undefined}
          aria-live="polite"
          aria-label={isRolling ? 'Rolling' : `Total ${a + b}`}
        >
          {a + b}
        </span>
      )}
    </div>
  );
});

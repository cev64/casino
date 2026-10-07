/**
 * Table sounds, synthesised with the Web Audio API (no audio files, no deps).
 *
 * The goal is a quiet, upscale card room: clay chips, paper, felt and wood
 * rather than synth beeps. Every sound is a small physical model built from
 * band-passed noise transients and a few decaying resonant partials.
 *
 * Public API (unchanged):
 *   sounds.<name>()          fire-and-forget, never throws, no-op when muted
 *   setSoundEnabled(bool)
 *   isSoundEnabled()
 *
 * Synthesis is written against a generic (ctx, out, t) triple, so the same
 * code renders to the live AudioContext or to an OfflineAudioContext
 * (see `soundEngine`, used for measuring levels in tests).
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const rnd = (a, b) => a + Math.random() * (b - a);
const jitter = (amount) => 1 + (Math.random() * 2 - 1) * amount; // 1 +/- amount
const EPS = 0.0001;

const disposeLater = (src, nodes) => {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  };
};

/* ------------------------------------------------------------------ */
/* Noise buffers (generated once per context, then cached)            */
/* ------------------------------------------------------------------ */

const NOISE_SECONDS = 2;
const noiseCache = new WeakMap();

const getNoise = (ctx, kind) => {
  let entry = noiseCache.get(ctx);
  if (!entry) {
    entry = {};
    noiseCache.set(ctx, entry);
  }
  if (entry[kind]) return entry[kind];

  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === 'pink') {
    // Paul Kellet's economy pink-noise filter, normalised.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  entry[kind] = buffer;
  return buffer;
};

/* ------------------------------------------------------------------ */
/* Voice primitives                                                   */
/* ------------------------------------------------------------------ */

/** Optional stereo placement; falls back to a plain gain on old browsers. */
const makeOutput = (ctx, out, pan) => {
  if (pan && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    return { node: p, extra: [p] };
  }
  return { node: out, extra: [] };
};

/**
 * Filtered noise burst with a fast attack and exponential decay.
 * o: { dur, attack, gain, type, f, f2, q, buf, pan, hp }
 *   f -> f2 sweeps the filter frequency exponentially over `dur`.
 */
const noiseBurst = (ctx, out, t, o) => {
  const {
    dur = 0.03,
    attack = 0.001,
    gain = 0.3,
    type = 'bandpass',
    f = 3000,
    f2 = null,
    q = 1,
    buf = 'white',
    pan = 0,
    hp = 0,
  } = o;

  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx, buf);

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f, t);
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t + dur);

  const env = ctx.createGain();
  env.gain.setValueAtTime(EPS, t);
  env.gain.linearRampToValueAtTime(gain, t + Math.max(attack, 0.0005));
  env.gain.exponentialRampToValueAtTime(EPS, t + dur);

  const nodes = [src, filter, env];
  src.connect(filter);
  let tail = filter;
  if (hp) {
    const h = ctx.createBiquadFilter();
    h.type = 'highpass';
    h.frequency.value = hp;
    filter.connect(h);
    tail = h;
    nodes.push(h);
  }
  tail.connect(env);
  const o2 = makeOutput(ctx, out, pan);
  env.connect(o2.node);
  nodes.push(...o2.extra);

  const offset = Math.random() * (NOISE_SECONDS - dur - 0.05);
  src.start(t, Math.max(0, offset));
  src.stop(t + dur + 0.03);
  disposeLater(src, nodes);
};

/**
 * Decaying resonant tone built from sine partials.
 * o: { f, f2, dur, gain, attack, partials, lp, pan, type }
 *   partials: [[ratio, amp], ...]
 */
const tone = (ctx, out, t, o) => {
  const {
    f = 440,
    f2 = null,
    dur = 0.3,
    gain = 0.1,
    attack = 0.004,
    partials = [[1, 1]],
    lp = 0,
    pan = 0,
    type = 'sine',
  } = o;

  const env = ctx.createGain();
  env.gain.setValueAtTime(EPS, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(EPS, t + dur);

  const nodes = [env];
  let head = env;
  if (lp) {
    const l = ctx.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = lp;
    l.Q.value = 0.5;
    l.connect(env);
    head = l;
    nodes.push(l);
  }
  const o2 = makeOutput(ctx, out, pan);
  env.connect(o2.node);
  nodes.push(...o2.extra);

  let last = null;
  for (const [ratio, amp] of partials) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f * ratio, t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2 * ratio, t + dur);
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g);
    g.connect(head);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    nodes.push(osc, g);
    last = osc;
  }
  if (last) disposeLater(last, nodes);
};

/* ------------------------------------------------------------------ */
/* Physical models                                                    */
/* ------------------------------------------------------------------ */

/** One clay-chip clack: two noise transients + faint resonant body. */
const clack = (ctx, out, t, { gain = 1, pitch = 1, pan = 0 } = {}) => {
  noiseBurst(ctx, out, t, {
    dur: 0.024, attack: 0.0008, gain: 1.7 * gain, f: 3400 * pitch, q: 1.7, pan,
  });
  noiseBurst(ctx, out, t + 0.0035, {
    dur: 0.045, attack: 0.001, gain: 1.2 * gain, f: 2200 * pitch, q: 2.4, pan,
  });
  // faint clay body resonance (slightly inharmonic) + felt thump
  tone(ctx, out, t, {
    f: 1180 * pitch, dur: 0.075, gain: 0.05 * gain, attack: 0.0008,
    partials: [[1, 1], [2.71, 0.45]], pan,
  });
  tone(ctx, out, t, {
    f: 230 * pitch, f2: 150 * pitch, dur: 0.05, gain: 0.07 * gain, attack: 0.001, pan,
  });
};

/** A single tiny paper tick used by the riffle. */
const paperTick = (ctx, out, t, gain, pan) => {
  noiseBurst(ctx, out, t, {
    dur: rnd(0.006, 0.012),
    attack: 0.0006,
    gain,
    f: rnd(2600, 6200),
    q: rnd(0.9, 1.6),
    hp: 1800,
    pan,
  });
};

/** A muffled click on felt (dice / chips tumbling). */
const feltClick = (ctx, out, t, gain, pitch = 1) => {
  noiseBurst(ctx, out, t, {
    dur: 0.03, attack: 0.001, gain: 1.4 * gain, type: 'lowpass',
    f: rnd(900, 1500) * pitch, q: 0.7, buf: 'pink',
  });
  tone(ctx, out, t, {
    f: rnd(150, 230) * pitch, f2: 90 * pitch, dur: 0.05, gain: 0.12 * gain, attack: 0.001,
  });
};

const bellPartials = [[1, 1], [2, 0.22], [3, 0.07], [4.1, 0.04]];

/** Soft, warm chime note: sine + gentle harmonics, rounded top. */
const chime = (ctx, out, t, f, { gain = 0.1, dur = 0.9, pan = 0 } = {}) => {
  tone(ctx, out, t, {
    f, dur, gain, attack: 0.01, partials: bellPartials, lp: 4200, pan,
  });
};

const synth = {
  chipPlace(ctx, out, t) {
    const pan = rnd(-0.15, 0.15);
    clack(ctx, out, t, { gain: rnd(0.8, 1), pitch: jitter(0.06), pan });
  },

  chipRemove(ctx, out, t) {
    const pan = rnd(-0.15, 0.15);
    // a small lift/scrape across the rack, then a lighter clack
    noiseBurst(ctx, out, t, {
      dur: 0.05, attack: 0.012, gain: 0.25, f: 2200, f2: 4200, q: 1.1, pan,
    });
    clack(ctx, out, t + 0.045, { gain: rnd(0.45, 0.6), pitch: jitter(0.05) * 1.12, pan });
  },

  chipStack(ctx, out, t) {
    const n = 2 + Math.floor(Math.random() * 3); // 2-4
    const pan = rnd(-0.2, 0.2);
    let at = t;
    for (let i = 0; i < n; i++) {
      clack(ctx, out, at, {
        gain: rnd(0.55, 0.85) * (1 - i * 0.08),
        pitch: jitter(0.1) * (1 + i * 0.03),
        pan: pan + rnd(-0.05, 0.05),
      });
      at += rnd(0.034, 0.07);
    }
  },

  cardDeal(ctx, out, t) {
    const pan = rnd(-0.25, 0.25);
    // paper sliding over felt
    noiseBurst(ctx, out, t, {
      dur: 0.12, attack: 0.035, gain: 0.6, f: 1300, f2: 3600, q: 0.8, hp: 700, pan,
    });
    // soft grain under the slide
    noiseBurst(ctx, out, t, {
      dur: 0.11, attack: 0.04, gain: 0.5, type: 'lowpass', f: 900, buf: 'pink', pan,
    });
    // light snap as it lands
    const s = t + 0.108;
    noiseBurst(ctx, out, s, {
      dur: 0.022, attack: 0.0008, gain: 0.55, f: 3000, q: 1.2, hp: 1500, pan,
    });
    tone(ctx, out, s, {
      f: 190, f2: 130, dur: 0.045, gain: 0.07, attack: 0.001, pan,
    });
  },

  cardFlip(ctx, out, t) {
    const pan = rnd(-0.2, 0.2);
    // quick paper flick
    noiseBurst(ctx, out, t, {
      dur: 0.06, attack: 0.012, gain: 0.8, f: 2400, f2: 5200, q: 1.1, hp: 1200, pan,
    });
    noiseBurst(ctx, out, t + 0.05, {
      dur: 0.016, attack: 0.0008, gain: 0.6, f: 3400, q: 1.3, hp: 1800, pan,
    });
  },

  shuffle(ctx, out, t) {
    // riffle: tiny paper ticks, accelerating then decelerating over ~700ms
    const total = 0.72;
    const pan = rnd(-0.1, 0.1);

    // faint paper bed under the ticks
    noiseBurst(ctx, out, t, {
      dur: total, attack: 0.22, gain: 0.12, f: 1900, q: 0.6, hp: 900, pan,
    });

    let at = 0;
    while (at < total) {
      const u = at / total;
      const rate = 22 + 52 * Math.sin(Math.PI * u); // ticks / second
      const weight = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.05));
      paperTick(ctx, out, t + at, rnd(0.16, 0.4) * weight, pan + rnd(-0.08, 0.08));
      at += (1 / rate) * rnd(0.7, 1.3);
    }
    // the bridge settles with a soft pat
    noiseBurst(ctx, out, t + total + 0.02, {
      dur: 0.05, attack: 0.002, gain: 0.3, type: 'lowpass', f: 1100, buf: 'pink', pan,
    });
  },

  diceShake(ctx, out, t) {
    // dice rattling in a cupped hand: 4 shakes, each a small cluster of clacks
    const pan = rnd(-0.1, 0.1);
    noiseBurst(ctx, out, t, {
      dur: 0.5, attack: 0.1, gain: 0.07, type: 'lowpass', f: 700, buf: 'pink', pan,
    });
    const shakes = 4;
    for (let s = 0; s < shakes; s++) {
      const base = t + s * rnd(0.105, 0.125);
      const clicks = 3 + Math.floor(Math.random() * 3);
      for (let c = 0; c < clicks; c++) {
        const at = base + c * rnd(0.008, 0.02);
        const g = rnd(0.5, 1) * (0.7 + 0.3 * Math.sin((Math.PI * (s + 0.5)) / shakes));
        noiseBurst(ctx, out, at, {
          dur: rnd(0.012, 0.022), attack: 0.0007, gain: 0.55 * g,
          f: rnd(1500, 3000), q: 3, pan: pan + rnd(-0.08, 0.08),
        });
        tone(ctx, out, at, {
          f: rnd(700, 1100), dur: 0.03, gain: 0.04 * g, attack: 0.0007,
          partials: [[1, 1], [2.3, 0.4]], pan,
        });
      }
    }
  },

  diceRoll(ctx, out, t) {
    // tumbling across felt: muffled clicks at a decreasing rate
    const total = 0.95;
    noiseBurst(ctx, out, t, {
      dur: total, attack: 0.06, gain: 0.09, type: 'lowpass', f: 520, buf: 'pink',
    });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const at = t + total * Math.pow(u, 0.62) * 0.92 + rnd(-0.01, 0.01);
      const g = (1 - u * 0.65) * rnd(0.7, 1);
      feltClick(ctx, out, Math.max(t, at), 0.38 * g, 1 - u * 0.2);
    }
  },

  diceLand(ctx, out, t) {
    // two soft thuds on felt / against the back wall
    const pan = rnd(-0.1, 0.1);
    const thud = (at, g, pitch) => {
      tone(ctx, out, at, {
        f: 125 * pitch, f2: 70 * pitch, dur: 0.12, gain: 0.3 * g, attack: 0.002, pan,
      });
      noiseBurst(ctx, out, at, {
        dur: 0.035, attack: 0.001, gain: 0.5 * g, type: 'lowpass', f: 800 * pitch,
        buf: 'pink', pan,
      });
    };
    thud(t, rnd(0.85, 1), 1);
    thud(t + rnd(0.12, 0.16), rnd(0.45, 0.6), 1.25);
  },

  win(ctx, out, t) {
    // soft, warm two-note chime
    chime(ctx, out, t, 659.25, { gain: 0.12, dur: 0.8 }); // E5
    chime(ctx, out, t + 0.12, 987.77, { gain: 0.1, dur: 1.0 }); // B5
  },

  bigWin(ctx, out, t) {
    // slightly richer, still calm: three notes of a major triad
    chime(ctx, out, t, 523.25, { gain: 0.11, dur: 0.85 }); // C5
    chime(ctx, out, t + 0.11, 659.25, { gain: 0.1, dur: 0.95 }); // E5
    chime(ctx, out, t + 0.22, 783.99, { gain: 0.1, dur: 1.4 }); // G5
    chime(ctx, out, t + 0.22, 1567.98, { gain: 0.025, dur: 1.2 }); // quiet octave sheen
  },

  lose(ctx, out, t) {
    // very subtle: a muted low tone and a soft chip sweep. No wah-wah.
    tone(ctx, out, t, {
      f: 220, f2: 196, dur: 0.42, gain: 0.08, attack: 0.02, lp: 700,
      partials: [[1, 1], [2, 0.12]],
    });
    noiseBurst(ctx, out, t + 0.02, {
      dur: 0.2, attack: 0.03, gain: 0.2, f: 1800, f2: 650, q: 0.9, hp: 400,
    });
  },

  push(ctx, out, t) {
    tone(ctx, out, t, {
      f: 440, dur: 0.38, gain: 0.15, attack: 0.012, lp: 3000,
      partials: [[1, 1], [2, 0.14]],
    });
  },

  error(ctx, out, t) {
    // gentle low double tick
    const tick = (at, f) => {
      tone(ctx, out, at, { f, f2: f * 0.8, dur: 0.05, gain: 0.14, attack: 0.001 });
      noiseBurst(ctx, out, at, {
        dur: 0.02, attack: 0.0008, gain: 0.25, type: 'lowpass', f: 1400, q: 0.7, buf: 'pink',
      });
    };
    tick(t, 190);
    tick(t + 0.095, 165);
  },

  buttonClick(ctx, out, t) {
    noiseBurst(ctx, out, t, {
      dur: 0.014, attack: 0.0007, gain: 0.8, f: 3600 * jitter(0.05), q: 1.6, hp: 1800,
    });
    tone(ctx, out, t, { f: 1700, dur: 0.02, gain: 0.025, attack: 0.0007 });
  },

  toggle(ctx, out, t) {
    // slightly lower and rounder than a click: a soft "tock"
    noiseBurst(ctx, out, t, {
      dur: 0.018, attack: 0.0008, gain: 0.8, f: 2400 * jitter(0.05), q: 1.4, hp: 1200,
    });
    tone(ctx, out, t, {
      f: 900, f2: 700, dur: 0.035, gain: 0.07, attack: 0.001,
    });
  },
};

const SOUND_NAMES = Object.keys(synth);

/* ------------------------------------------------------------------ */
/* Master chain                                                       */
/* ------------------------------------------------------------------ */

const MASTER_LEVEL = 1;

/** Builds master gain -> gentle compressor -> destination. Returns the gain. */
const createMaster = (ctx, level = MASTER_LEVEL) => {
  const gain = ctx.createGain();
  gain.gain.value = level;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.15;
  gain.connect(comp);
  comp.connect(ctx.destination);
  return gain;
};

/* ------------------------------------------------------------------ */
/* Live engine                                                        */
/* ------------------------------------------------------------------ */

let soundEnabled = true;
let audioCtx = null;
let master = null;
let unlockBound = false;
const lastPlayed = {};
const MIN_GAP_MS = 25;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor({ latencyHint: 'interactive' });
    master = createMaster(audioCtx);
  } catch {
    audioCtx = null;
    master = null;
  }
  return audioCtx;
};

const resumeIfNeeded = (ctx) => {
  if (ctx.state === 'running') return null;
  try {
    return ctx.resume();
  } catch {
    return null;
  }
};

/** Create/resume the shared context on the first user gesture. */
const bindUnlock = () => {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const events = ['pointerdown', 'touchend', 'keydown'];
  const unlock = () => {
    events.forEach((e) => window.removeEventListener(e, unlock, true));
    try {
      const ctx = getContext();
      if (ctx) resumeIfNeeded(ctx)?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  };
  events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
};
bindUnlock();

const play = (name) => {
  try {
    if (!soundEnabled || typeof window === 'undefined') return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (lastPlayed[name] != null && now - lastPlayed[name] < MIN_GAP_MS) return;
    lastPlayed[name] = now;

    const ctx = getContext();
    if (!ctx || !master) return;

    const run = () => {
      try {
        if (!soundEnabled) return;
        synth[name](ctx, master, ctx.currentTime + 0.012);
      } catch {
        /* never throw from a sound effect */
      }
    };

    const pending = resumeIfNeeded(ctx);
    if (pending && typeof pending.then === 'function') {
      pending.then(run, () => {});
    } else {
      run();
    }
  } catch {
    /* audio unavailable */
  }
};

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export const sounds = Object.fromEntries(SOUND_NAMES.map((name) => [name, () => play(name)]));

export const setSoundEnabled = (enabled) => {
  soundEnabled = !!enabled;
  // cut anything still ringing when muting; restore level when unmuting
  try {
    if (audioCtx && master) {
      const now = audioCtx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(soundEnabled ? MASTER_LEVEL : 0, now, 0.015);
    }
  } catch {
    /* ignore */
  }
};

export const isSoundEnabled = () => soundEnabled;

/** Internals for offline rendering / measurement (not used by the app). */
export const soundEngine = { synth, createMaster, SOUND_NAMES, MASTER_LEVEL };

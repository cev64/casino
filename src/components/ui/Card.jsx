import { memo, useEffect, useId, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

/*
 * Playing cards — poker proportions (2.5 x 3.5), warm paper stock, SVG pips and courts.
 * Each face is a single 250x350 SVG. Sizing is CSS (see objects.css, .pc / --pc-w).
 *
 * Deal timing contract: card `index` starts at  dealDelay + index * 0.3  seconds and its
 * main travel + settle (time-based springs) completes 0.5 s after it starts.
 */

const RED = '#C8102E';
const INK = '#15161A';
const GOLD = '#C9A24B';
const SKIN = '#F2E3CB';
const HAIR = '#2B2420';

const SUIT_NAMES = { hearts: 'hearts', diamonds: 'diamonds', clubs: 'clubs', spades: 'spades' };
const RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

const isRedSuit = (s) => s === 'hearts' || s === 'diamonds';

/* ---------- suit glyphs (path data in a -50..50 box, drawn around 0,0) ---------- */

const HEART = 'M0 43 C-6 36 -46 14 -46 -14 C-46 -33 -33 -44 -19 -44 C-9 -44 -2 -38 0 -29 C2 -38 9 -44 19 -44 C33 -44 46 -33 46 -14 C46 14 6 36 0 43 Z';
const DIAMOND = 'M0 -49 C7 -31 24 -13 39 0 C24 13 7 31 0 49 C-7 31 -24 13 -39 0 C-24 -13 -7 -31 0 -49 Z';
const SPADE = 'M0 -48 C8 -31 45 -15 45 12 C45 29 33 37 22 37 C14 37 8 33 4.5 27 C5 37 8 44 17 48 L-17 48 C-8 44 -5 37 -4.5 27 C-8 33 -14 37 -22 37 C-33 37 -45 29 -45 12 C-45 -15 -8 -31 0 -48 Z';
const CLUB_STEM = 'M0 4 C0 24 -4 37 -15 48 L15 48 C4 37 0 24 0 4 Z';

const Suit = ({ suit, x = 0, y = 0, s = 1, rot = 0, fill }) => {
  const t = `translate(${x} ${y})${rot ? ` rotate(${rot})` : ''} scale(${s})`;
  if (suit === 'hearts') return <path transform={t} d={HEART} fill={fill} />;
  if (suit === 'diamonds') return <path transform={t} d={DIAMOND} fill={fill} />;
  if (suit === 'spades') return <path transform={t} d={SPADE} fill={fill} />;
  return (
    <g transform={t} fill={fill}>
      <circle cx="0" cy="-24" r="21.5" />
      <circle cx="-24" cy="12" r="21.5" />
      <circle cx="24" cy="12" r="21.5" />
      <circle cx="0" cy="3" r="14" />
      <path d={CLUB_STEM} />
    </g>
  );
};

/* ---------- pip layouts (x: 76 / 125 / 174, y: 70 .. 280) ---------- */

const L = 78, C = 125, R = 172;
const PIPS = {
  2: [[C, 70], [C, 280]],
  3: [[C, 70], [C, 175], [C, 280]],
  4: [[L, 70], [R, 70], [L, 280], [R, 280]],
  5: [[L, 70], [R, 70], [C, 175], [L, 280], [R, 280]],
  6: [[L, 70], [R, 70], [L, 175], [R, 175], [L, 280], [R, 280]],
  7: [[L, 70], [R, 70], [C, 122], [L, 175], [R, 175], [L, 280], [R, 280]],
  8: [[L, 70], [R, 70], [C, 122], [L, 175], [R, 175], [C, 228], [L, 280], [R, 280]],
  9: [[L, 70], [R, 70], [L, 140], [R, 140], [C, 175], [L, 210], [R, 210], [L, 280], [R, 280]],
  10: [[L, 70], [R, 70], [C, 101], [L, 133], [R, 133], [L, 217], [R, 217], [C, 249], [L, 280], [R, 280]],
};

/* ---------- court figures (upper figure; the lower one is a 180 degree rotation) ---------- */

const CourtHalf = ({ rank, suit, c, clip }) => (
  <g clipPath={`url(#${clip})`}>
    {/* attribute held at the right: sword, flower or halberd */}
    {rank === 'K' && (
      <g>
        <path d="M170.2 92 L173.8 92 L173.8 150 L170.2 150 Z" fill="#DCE1E8" stroke={INK} strokeOpacity=".45" strokeWidth=".7" />
        <path d="M172 92 L172 150" stroke="#fff" strokeOpacity=".8" strokeWidth=".8" />
        <path d="M170.2 92 L172 86 L173.8 92 Z" fill="#DCE1E8" stroke={INK} strokeOpacity=".45" strokeWidth=".7" />
        <rect x="163" y="148" width="18" height="3.4" rx="1.4" fill={GOLD} />
        <rect x="170.4" y="151" width="3.2" height="16" fill={HAIR} />
      </g>
    )}
    {rank === 'Q' && (
      <g>
        <path d="M172 126 C171 140 173 150 172 168" stroke="#4E7B4A" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M172 140 C164 138 160 132 160 130 C166 130 171 134 172 140 Z" fill="#4E7B4A" />
        {[0, 72, 144, 216, 288].map((r) => (
          <ellipse key={r} cx="172" cy="113" rx="4.6" ry="8.2" fill={c} transform={`rotate(${r} 172 121)`} />
        ))}
        <circle cx="172" cy="121" r="3.4" fill={GOLD} />
      </g>
    )}
    {rank === 'J' && (
      <g>
        <rect x="170.8" y="92" width="2.4" height="80" fill={HAIR} />
        <path d="M173 98 C184 94 190 101 187 110 C182 106 178 108 173 112 Z" fill="#DCE1E8" stroke={INK} strokeOpacity=".45" strokeWidth=".7" />
        <path d="M171 94 L172 86 L173 94 Z" fill={GOLD} />
        <rect x="167" y="150" width="10" height="3" rx="1.2" fill={GOLD} />
      </g>
    )}

    {/* robe */}
    <path d="M56 215 L56 164 C58 148 82 140 108 134 L142 134 C168 140 192 148 194 164 L194 215 Z" fill={c} />
    <path d="M56 215 L56 164 C58 148 82 140 108 134 L142 134 C168 140 192 148 194 164 L194 215 Z" fill="#000" fillOpacity=".08" />
    <path d="M96 146 C84 168 80 190 82 215 M154 146 C166 168 170 190 168 215" stroke="#fff" strokeOpacity=".16" strokeWidth="2.4" fill="none" />
    <path d="M110 135 L140 135 L146 215 L104 215 Z" fill="#fff" fillOpacity=".1" />
    <path d="M110 135 L104 215 M140 135 L146 215" stroke={GOLD} strokeWidth="1.6" fill="none" />
    <path d="M58 160 C62 148 84 140 108 134 L142 134 C166 140 188 148 192 160" stroke={GOLD} strokeWidth="2.4" fill="none" />
    <path d="M106 134 L125 150 L144 134" stroke={GOLD} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
    <path d="M108 134 L125 148 L142 134 L142 128 L108 128 Z" fill="#F7F3EA" />
    <Suit suit={suit} x={125} y={167} s={0.21} fill={GOLD} />
    {/* neck + head */}
    <rect x="118.5" y="112" width="13" height="20" rx="4" fill={SKIN} />
    <rect x="118.5" y="124" width="13" height="8" rx="3" fill="#000" opacity=".1" />
    {rank === 'Q' && (
      <>
        <path d="M105 104 C96 120 97 142 104 158 L118 158 C112 140 111 120 113 106 Z" fill={HAIR} />
        <path d="M145 104 C154 120 153 142 146 158 L132 158 C138 140 139 120 137 106 Z" fill={HAIR} />
      </>
    )}
    {rank === 'K' && (
      <path d="M106.5 106 C104 134 146 134 143.5 106 C141 120 134 126 125 126 C116 126 109 120 106.5 106 Z" fill={HAIR} />
    )}
    <ellipse cx="125" cy="106" rx="17" ry="19.5" fill={SKIN} />
    <ellipse cx="125" cy="106" rx="17" ry="19.5" fill="none" stroke={INK} strokeOpacity=".4" strokeWidth=".8" />
    {rank !== 'J' && <path d="M107.5 100 C110 86 140 86 142.5 100 C136 94 114 94 107.5 100 Z" fill={HAIR} />}
    {rank === 'J' && (
      <>
        <path d="M108 100 C105 110 106 118 109 123 L113 106 Z" fill={HAIR} />
        <path d="M142 100 C145 110 144 118 141 123 L137 106 Z" fill={HAIR} />
      </>
    )}
    {rank === 'K' && (
      <>
        <path d="M106 94 L106 74 L115.5 84 L125 68 L134.5 84 L144 74 L144 94 Z" fill={GOLD} />
        <rect x="105" y="90" width="40" height="8" rx="1.8" fill={GOLD} />
        <rect x="105" y="90" width="40" height="2.2" fill="#fff" opacity=".4" />
        <circle cx="125" cy="94.5" r="2.4" fill={c} />
        <circle cx="114" cy="94.5" r="1.7" fill={c} />
        <circle cx="136" cy="94.5" r="1.7" fill={c} />
        <circle cx="125" cy="68" r="2" fill={GOLD} />
      </>
    )}
    {rank === 'Q' && (
      <>
        <path d="M106 96 L104.5 82 L113.5 89 L119.5 77 L125 88 L130.5 77 L136.5 89 L145.5 82 L144 96 Z" fill={GOLD} />
        <rect x="105.5" y="92" width="39" height="6" rx="1.8" fill={GOLD} />
        <rect x="105.5" y="92" width="39" height="1.8" fill="#fff" opacity=".4" />
        <circle cx="125" cy="95" r="2.2" fill={c} />
        <circle cx="104.5" cy="81" r="1.9" fill={GOLD} />
        <circle cx="145.5" cy="81" r="1.9" fill={GOLD} />
        <circle cx="119.5" cy="76" r="1.5" fill={GOLD} />
        <circle cx="130.5" cy="76" r="1.5" fill={GOLD} />
      </>
    )}
    {rank === 'J' && (
      <>
        <path d="M104 101 C101 80 119 70 136 74 C149 78 149 92 147 101 C137 94 114 94 104 101 Z" fill={c} />
        <path d="M104.5 98 C115 92 137 92 146.5 98" stroke={GOLD} strokeWidth="2.6" fill="none" />
        <path d="M138 76 C154 56 175 62 177 76 C166 72 152 77 144 90 Z" fill={GOLD} />
        <path d="M142 82 C154 69 166 68 172 71" stroke="#fff" strokeOpacity=".55" strokeWidth="1" fill="none" />
      </>
    )}
    {/* small suit marks in the panel corner */}
    <Suit suit={suit} x={74} y={86} s={0.2} fill={c} />
  </g>
);

const Court = ({ rank, suit, c, id }) => (
  <g>
    <defs>
      <clipPath id={`cu${id}`}><path d="M57 64 H193 V153 L57 197 Z" /></clipPath>
      <clipPath id={`cl${id}`}><path d="M193 286 H57 V197 L193 153 Z" /></clipPath>
    </defs>
    <rect x="53" y="63" width="144" height="224" rx="6" fill={c} fillOpacity=".06" stroke={c} strokeOpacity=".55" strokeWidth="1.3" />
    <rect x="57" y="67" width="136" height="216" rx="3" fill="none" stroke={GOLD} strokeOpacity=".75" strokeWidth=".9" />
    <CourtHalf rank={rank} suit={suit} c={c} clip={`cu${id}`} />
    <g transform="rotate(180 125 175)">
      <CourtHalf rank={rank} suit={suit} c={c} clip={`cu${id}`} />
    </g>
    <path d="M57 197 L193 153" stroke={GOLD} strokeOpacity=".8" strokeWidth="1.1" />
  </g>
);

/* ---------- face ---------- */

const Corner = ({ rank, suit, c }) => (
  <g>
    <text
      x="24" y="53" textAnchor="middle" fill={c}
      fontFamily="'Barlow Condensed','Inter',sans-serif" fontWeight="600"
      fontSize={rank === '10' ? 44 : 50}
      letterSpacing={rank === '10' ? -3 : 0}
    >{rank}</text>
    <Suit suit={suit} x={24} y={81} s={0.29} fill={c} />
  </g>
);

const CardFace = memo(({ rank, suit }) => {
  const id = useId().replace(/:/g, '');
  const c = isRedSuit(suit) ? RED : INK;
  const pips = PIPS[rank];
  const isAce = rank === 'A';
  const isCourt = rank === 'J' || rank === 'Q' || rank === 'K';
  return (
    <svg viewBox="0 0 250 350" className="pc-svg" aria-hidden="true" focusable="false">
      <Corner rank={rank} suit={suit} c={c} />
      <g transform="rotate(180 125 175)"><Corner rank={rank} suit={suit} c={c} /></g>
      {pips && pips.map(([x, y], i) => (
        <Suit key={i} suit={suit} x={x} y={y} s={0.52} rot={y > 175 ? 180 : 0} fill={c} />
      ))}
      {isAce && suit === 'spades' && (
        <g>
          <circle cx="125" cy="175" r="104" fill="none" stroke={c} strokeOpacity=".22" strokeWidth="1.2" />
          <circle cx="125" cy="175" r="97" fill="none" stroke={c} strokeOpacity=".14" strokeWidth=".8" strokeDasharray="1.5 5" strokeLinecap="round" />
          <Suit suit="spades" x={125} y={178} s={1.62} fill={c} />
          <Suit suit="spades" x={125} y={178} s={0.5} fill="#FBFAF7" />
        </g>
      )}
      {isAce && suit !== 'spades' && (
        <g>
          <circle cx="125" cy="175" r="78" fill="none" stroke={c} strokeOpacity=".14" strokeWidth="1" />
          <Suit suit={suit} x={125} y={175} s={1.28} fill={c} />
        </g>
      )}
      {isCourt && <Court rank={rank} suit={suit} c={c} id={id} />}
    </svg>
  );
});

/* ---------- back ---------- */

export const CardBackArt = memo(() => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 250 350" className="pc-svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`lat${id}`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H18M0 0V18" stroke="#9FB2E6" strokeOpacity=".34" strokeWidth=".9" fill="none" />
          <circle cx="0" cy="0" r="1.2" fill="#C7D3F4" fillOpacity=".55" />
        </pattern>
        <radialGradient id={`sheen${id}`} cx=".3" cy=".2" r="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".12" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="13" y="13" width="224" height="324" rx="9" fill="#14264E" />
      <rect x="13" y="13" width="224" height="324" rx="9" fill={`url(#lat${id})`} />
      <rect x="13" y="13" width="224" height="324" rx="9" fill={`url(#sheen${id})`} />
      <rect x="25" y="25" width="200" height="300" rx="5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
      <rect x="30" y="30" width="190" height="290" rx="3" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth=".8" />
      <g transform="translate(125 175)">
        <ellipse rx="66" ry="92" fill="#14264E" />
        <ellipse rx="66" ry="92" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" />
        <ellipse rx="60" ry="86" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth=".8" />
        <g fill="none" stroke="#DCE5FF" strokeOpacity=".5" strokeWidth=".8">
          {Array.from({ length: 12 }).map((_, i) => (
            <ellipse key={i} rx="50" ry="17" transform={`rotate(${i * 15})`} />
          ))}
        </g>
        <circle r="13" fill="#14264E" stroke="#fff" strokeOpacity=".85" strokeWidth="1.3" />
        <circle r="5" fill="#fff" fillOpacity=".85" />
      </g>
      {[[38, 38, 0], [212, 38, 90], [212, 312, 180], [38, 312, 270]].map(([x, y, r]) => (
        <g key={x + '-' + y} transform={`translate(${x} ${y}) rotate(${r})`} fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth=".9">
          <path d="M0 0 H16 M0 0 V16" />
          <circle cx="7" cy="7" r="3.2" />
        </g>
      ))}
    </svg>
  );
});

/* ---------- Card ---------- */

const hashStr = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
};

const SIZE_CLASS = { sm: 'pc-sm', md: 'pc-md', lg: 'pc-lg' };

export const cardLabel = (rank, suit) => `${RANK_NAMES[rank] || rank} of ${SUIT_NAMES[suit] || suit}`;

export const Card = memo(({
  rank, suit, faceDown = false, index = 0, dealDelay = 0, size = 'md', className = '', style, instant = false,
}) => {
  const rest = (hashStr(`${rank}${suit}${index}`) - 0.5) * 3; // +-1.5deg, stable per card
  const delay = dealDelay + index * 0.3;
  const flipControls = useAnimationControls();
  const firstRender = useRef(true);

  // Flip with a slight lift. Not on first paint (cards arrive already in their state).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    flipControls.start({
      rotateY: faceDown ? 180 : 0,
      scale: [1, 1.05, 1],
      transition: {
        rotateY: { duration: 0.5, ease: [0.45, 0, 0.2, 1] },
        scale: { duration: 0.5, times: [0, 0.5, 1], ease: 'easeInOut' },
      },
    });
  }, [faceDown, flipControls]);

  return (
    <motion.div
      className={`pc ${SIZE_CLASS[size] || SIZE_CLASS.md} ${className}`}
      style={style}
      role="img"
      aria-label={faceDown ? 'Face-down card' : cardLabel(rank, suit)}
      initial={instant ? false : { x: '230%', y: '-150%', rotate: 16, scale: 0.92, opacity: 0 }}
      animate={{ x: '0%', y: '0%', rotate: rest, scale: 1, opacity: 1 }}
      transition={{
        x: { type: 'spring', duration: 0.5, bounce: 0.05, delay },
        y: { type: 'spring', duration: 0.5, bounce: 0.22, delay },
        rotate: { type: 'spring', duration: 0.5, bounce: 0.4, delay },
        scale: { type: 'spring', duration: 0.5, bounce: 0.3, delay },
        opacity: { duration: 0.12, delay },
      }}
    >
      <motion.span
        className="pc-shadow"
        aria-hidden="true"
        initial={instant ? false : { opacity: 0.35, y: -10, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: delay + 0.1, type: 'spring', duration: 0.45, bounce: 0.1 }}
      />
      <motion.div
        className="pc-flip"
        initial={{ rotateY: faceDown ? 180 : 0 }}
        animate={flipControls}
      >
        <div className="pc-face"><CardFace rank={rank} suit={suit} /></div>
        <div className="pc-back"><CardBackArt /></div>
      </motion.div>
    </motion.div>
  );
});

/* ---------- Hand ---------- */

const sameCard = (a, b) => a && b && a.rank === b.rank && a.suit === b.suit;

export const Hand = memo(({
  cards = [], faceDownFirst = false, dealDelay = 0, size = 'md', label = '', status = null, className = '',
}) => {
  // New "epoch" when the hand diverges from the previous one (a fresh deal with different cards),
  // so cards re-deal; while cards are only appended, the existing ones never re-animate.
  const prev = useRef({ cards: [], epoch: 0 });
  const p = prev.current;
  const n = Math.min(p.cards.length, cards.length);
  let diverged = false;
  for (let i = 0; i < n; i += 1) if (!sameCard(p.cards[i], cards[i])) { diverged = true; break; }
  if (diverged) p.epoch += 1;
  p.cards = cards;

  return (
    <div
      className={`hand ${className}`}
      data-status={status || undefined}
      data-size={size}
    >
      {label ? <span className="hand-label">{label}</span> : null}
      <motion.div
        className={`hand-fan ${SIZE_CLASS[size] || SIZE_CLASS.md}`}
        animate={{ y: status === 'win' || status === 'blackjack' ? -5 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        {cards.map((card, index) => (
          <div className="hand-slot" key={`${p.epoch}-${card.id ?? `${card.rank}-${card.suit}-${index}`}`}>
            <Card
              rank={card.rank}
              suit={card.suit}
              faceDown={(index === 0 && faceDownFirst) || !!card.faceDown}
              index={index}
              dealDelay={dealDelay}
              size={size}
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
});

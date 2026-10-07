import { memo } from 'react';

/**
 * Dealing shoe, seen from above-front, resting at the dealer's left (top right of the felt).
 * Smoked acrylic body, a slanted floor of cards and a front lip. Purely decorative; the
 * penetration read-out beside it is the only text.
 */
export const Shoe = memo(({ penetration = 0 }) => {
  const pct = Math.round(Math.max(0, Math.min(1, penetration)) * 100);
  // Remaining cards show as a stack that thins as the shoe is dealt
  const remaining = 1 - Math.max(0, Math.min(1, penetration));
  const stackH = 6 + remaining * 15;
  return (
    <div className="bj-shoe" title={`Shoe ${pct}% dealt. The cut card sits at 75%.`}>
      <svg viewBox="0 0 96 64" className="bj-shoe-svg" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="shoeBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3f48" />
            <stop offset="1" stopColor="#15181d" />
          </linearGradient>
          <linearGradient id="shoeTop" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#575d68" />
            <stop offset="1" stopColor="#2c3037" />
          </linearGradient>
          <linearGradient id="shoeGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".28" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".04" />
            <stop offset="1" stopColor="#fff" stopOpacity=".12" />
          </linearGradient>
        </defs>

        {/* contact shadow */}
        <ellipse cx="50" cy="58" rx="40" ry="4.2" fill="#000" opacity=".34" />

        {/* back wall + body */}
        <path d="M14 26 L86 14 L90 18 L90 54 Q90 56 88 56 L16 56 Q14 56 14 54 Z" fill="url(#shoeBody)" />
        {/* top rail */}
        <path d="M14 26 L86 14 L90 18 L18 30 Z" fill="url(#shoeTop)" />
        <path d="M14 26 L86 14" stroke="#fff" strokeOpacity=".28" strokeWidth=".8" fill="none" />

        {/* card stack seen through the window */}
        <g>
          <path d={`M24 ${54 - stackH} L82 ${44 - stackH} L82 44 L24 54 Z`} fill="#F4EFE4" />
          <path d={`M24 ${54 - stackH} L82 ${44 - stackH}`} stroke="#fff" strokeWidth="1" opacity=".9" fill="none" />
          {Array.from({ length: 5 }).map((_, i) => (
            <path
              key={i}
              d={`M24 ${54 - stackH + ((i + 1) * stackH) / 6} L82 ${44 - stackH + ((i + 1) * stackH) / 6}`}
              stroke="#8d8676" strokeOpacity=".5" strokeWidth=".5" fill="none"
            />
          ))}
          <path d="M24 54 L82 44" stroke="#000" strokeOpacity=".18" strokeWidth="1" fill="none" />
        </g>

        {/* acrylic front panel */}
        <path d="M14 26 L18 30 L18 56 L16 56 Q14 56 14 54 Z" fill="#0d0f12" opacity=".6" />
        <path d="M18 30 L90 18 L90 54 Q90 56 88 56 L18 56 Z" fill="url(#shoeGlass)" />

        {/* front lip where cards leave the shoe */}
        <path d="M8 50 L22 47.6 L22 56 L10 56 Q8 56 8 54 Z" fill="#1d2025" />
        <path d="M8 50 L22 47.6" stroke="#fff" strokeOpacity=".3" strokeWidth=".8" fill="none" />
      </svg>
      <span className="felt-print bj-print bj-shoe-read tnum">Shoe {pct}%</span>
    </div>
  );
});

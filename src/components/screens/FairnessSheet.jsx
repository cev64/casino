import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { generateDiceRoll, generateGameResult, generateSeed, generateShuffledDeck, sha256 } from '../../utils/provablyFair';

const SUITS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const MODES = [
  { value: 'craps', label: 'Craps roll' },
  { value: 'blackjack', label: 'Blackjack shoe' },
];

const Field = ({ id, label, value, onChange, placeholder, inputMode, mono, error }) => (
  <div>
    <label htmlFor={id} className="t-micro block mb-1.5">{label}</label>
    <input
      id={id}
      className="field-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      style={mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13 } : undefined}
    />
    {error && <p id={`${id}-error`} className="text-[14px] leading-5 text-ink-2 mt-1.5">{error}</p>}
  </div>
);

const Result = ({ label, children }) => (
  <div>
    <p className="t-micro mb-1.5">{label}</p>
    {children}
  </div>
);

/** Explains the scheme and lets people recompute a roll or the opening cards of a shoe. */
export const FairnessSheet = ({ open, onClose }) => {
  const [mode, setMode] = useState('craps');
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');
  const [out, setOut] = useState(null);

  const nonceText = nonce.trim();
  const nonceValid = /^\d+$/.test(nonceText) && Number.isSafeInteger(Number(nonceText));
  const nonceError = nonceText !== '' && !nonceValid ? 'Use a whole number, 0 or more.' : null;
  const n = nonceValid ? Number(nonceText) : NaN;
  const ready = !!serverSeed.trim() && !!clientSeed.trim() && nonceValid;

  useEffect(() => {
    if (!open || !ready) { setOut(null); return undefined; }
    let cancelled = false;
    const run = async () => {
      const s = serverSeed.trim();
      const c = clientSeed.trim();
      const [seedHash, hash] = await Promise.all([sha256(s), generateGameResult(s, c, n)]);
      let detail;
      if (mode === 'craps') {
        detail = await generateDiceRoll(s, c, n);
      } else {
        const deck = await generateShuffledDeck(s, c, n);
        // The engine deals from the end of the shuffled shoe.
        detail = deck.slice(-6).reverse();
      }
      if (!cancelled) setOut({ mode, seedHash, hash, detail });
    };
    const t = setTimeout(() => { run().catch(() => !cancelled && setOut(null)); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, ready, mode, serverSeed, clientSeed, n]);

  const fillExample = () => {
    setServerSeed(generateSeed());
    setClientSeed(generateSeed());
    setNonce('0');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Provably fair">
      <p className="text-ink-2">
        Dice and shuffles come from SHA-256 hashes of three values, so a result can be recomputed from them.
      </p>

      <ul className="rule-list mt-5">
        <li className="flex-col !gap-0.5 sm:flex-row sm:!gap-6">
          <span className="rule-term sm:min-w-[96px]">Server seed</span>
          <span className="rule-text sm:flex-1">Random, created when a table starts.</span>
        </li>
        <li className="flex-col !gap-0.5 sm:flex-row sm:!gap-6">
          <span className="rule-term sm:min-w-[96px]">Client seed</span>
          <span className="rule-text sm:flex-1">Random, created in your browser.</span>
        </li>
        <li className="flex-col !gap-0.5 sm:flex-row sm:!gap-6">
          <span className="rule-term sm:min-w-[96px]">Nonce</span>
          <span className="rule-text sm:flex-1">A counter. Craps adds one per roll. A blackjack shoe hashes one nonce per card.</span>
        </li>
      </ul>
      <p className="mono-block mt-4">SHA-256(serverSeed:clientSeed:nonce)</p>
      <p className="text-ink-2 mt-4">
        Seeds are not shown during play. The verifier recomputes outcomes from seeds you enter, so you can check the method with your own.
      </p>

      <h3 className="t-micro mt-8 mb-3">Verify</h3>
      <SegmentedControl label="What to verify" options={MODES} value={mode} onChange={setMode} className="w-full mb-4" size="sm" />

      <div className="grid gap-3">
        <Field id="fair-server" label="Server seed" value={serverSeed} onChange={setServerSeed} placeholder="Enter server seed" mono />
        <Field id="fair-client" label="Client seed" value={clientSeed} onChange={setClientSeed} placeholder="Enter client seed" mono />
        <Field id="fair-nonce" label="Nonce" value={nonce} onChange={setNonce} inputMode="numeric" placeholder="0" error={nonceError} />
      </div>

      <div className="mt-4">
        <Button variant="ghost" size="sm" onClick={fillExample}>Use random seeds</Button>
      </div>

      {out && out.mode === mode && (
        <div className="grid gap-4 mt-6" aria-live="polite">
          {mode === 'craps' ? (
            <Result label="Dice">
              <p className="t-title tnum">{out.detail.die1} + {out.detail.die2} = {out.detail.total}</p>
            </Result>
          ) : (
            <Result label="First cards dealt">
              <p className="t-card-title">
                {out.detail.map((c) => `${c.rank}${SUITS[c.suit]}`).join('  ')}
              </p>
            </Result>
          )}
          <Result label="Server seed hash"><p className="mono-block">{out.seedHash}</p></Result>
          {mode === 'craps' && <Result label="Result hash"><p className="mono-block">{out.hash}</p></Result>}
        </div>
      )}
    </Sheet>
  );
};

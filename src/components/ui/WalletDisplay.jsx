import { useEffect, useRef } from 'react';
import { RollingNumber, formatMoney } from './RollingNumber';
import { useWalletStore } from '../../stores/walletStore';

/**
 * Balance read-out for the top bar: quiet pill, rolling figure, no decoration.
 * Winnings still flying to it (`held`) are added as they land, with a small bump.
 */
export const WalletDisplay = ({ className = '' }) => {
  const balance = useWalletStore((s) => s.balance);
  const held = useWalletStore((s) => s.held);
  const arrivals = useWalletStore((s) => s.arrivals);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || arrivals === 0) return undefined;
    el.removeAttribute('data-bump');
    void el.offsetWidth; // restart the animation
    el.setAttribute('data-bump', '');
    const t = setTimeout(() => el.removeAttribute('data-bump'), 420);
    return () => clearTimeout(t);
  }, [arrivals]);

  return (
    <div
      ref={ref}
      className={`wallet inline-flex items-center gap-2 h-9 pl-3.5 pr-3.5 rounded-full bg-fill ${className}`}
      role="group"
      aria-label={`Balance ${formatMoney(balance, { cents: true })}`}
    >
      <span className="t-micro hidden min-[420px]:inline" aria-hidden="true">Balance</span>
      <RollingNumber value={balance - held} className="text-[17px] leading-6 font-semibold tracking-[-0.2px] text-ink" />
    </div>
  );
};

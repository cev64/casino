import { RollingNumber, formatMoney } from './RollingNumber';
import { useWalletStore } from '../../stores/walletStore';

/** Balance read-out for the top bar: quiet pill, rolling figure, no decoration. */
export const WalletDisplay = ({ className = '' }) => {
  const balance = useWalletStore((s) => s.balance);

  return (
    <div
      className={`wallet inline-flex items-center gap-2 h-9 pl-3.5 pr-3.5 rounded-full bg-fill ${className}`}
      role="group"
      aria-label={`Balance ${formatMoney(balance, { cents: true })}`}
    >
      <span className="t-micro hidden min-[420px]:inline" aria-hidden="true">Balance</span>
      <RollingNumber value={balance} className="text-[17px] leading-6 font-semibold tracking-[-0.2px] text-ink" />
    </div>
  );
};

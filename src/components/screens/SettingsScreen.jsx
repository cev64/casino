import { ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import { RollingNumber, formatMoney } from '../ui/RollingNumber';
import { toast } from '../ui/Toast';
import { useSettingsStore, haptic } from '../../stores/settingsStore';
import { useWalletStore } from '../../stores/walletStore';
import { sounds } from '../../utils/sounds';
import pkg from '../../../package.json';

const STARTING_BALANCE = 1000;

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const Group = ({ title, children }) => (
  <section>
    <h2 className="t-micro group-label">{title}</h2>
    <div className="glass p-2">{children}</div>
  </section>
);

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4 min-h-[56px] px-3">
    <span className="text-[16px] leading-6 font-medium text-ink">{label}</span>
    {children}
  </div>
);

const LinkRow = ({ label, onClick }) => (
  <button type="button" className="row-btn !px-3 text-ink" onClick={onClick}>
    <span className="flex-1 text-[16px] leading-6 font-medium">{label}</span>
    <ChevronRight size={20} strokeWidth={1.75} className="text-ink-3" aria-hidden="true" />
  </button>
);

export const SettingsScreen = ({ onOpenRules, onOpenFairness }) => {
  const { theme, sound, haptics, setTheme, setSound, setHaptics } = useSettingsStore();
  const balance = useWalletStore((s) => s.balance);
  const setBalance = useWalletStore((s) => s.setBalance);

  const resetBalance = () => {
    if (balance === STARTING_BALANCE) {
      toast(`Balance is already ${formatMoney(STARTING_BALANCE)}`);
      return;
    }
    const previous = balance;
    setBalance(STARTING_BALANCE);
    haptic(10);
    toast('Balance reset', { action: { label: 'Undo', onClick: () => setBalance(previous) } });
  };

  const changeSound = (next) => {
    setSound(next);
    if (next) sounds.toggle?.();
  };

  const changeHaptics = (next) => {
    setHaptics(next);
    if (next) haptic(10);
  };

  return (
    <div className="grid gap-6 nav:gap-x-6 nav:grid-cols-2 items-start max-w-[1000px]">
      <div className="grid gap-6">
        <Group title="Appearance">
          <SegmentedControl label="Appearance" options={THEMES} value={theme} onChange={setTheme} className="w-full" />
        </Group>

        <Group title="Feedback">
          <Row label="Sound"><Switch label="Sound" checked={sound} onChange={changeSound} /></Row>
          <Row label="Haptics"><Switch label="Haptics" checked={haptics} onChange={changeHaptics} /></Row>
        </Group>

        <Group title="Wallet">
          <Row label="Balance">
            <RollingNumber value={balance} className="text-[16px] leading-6 font-medium text-ink" />
          </Row>
          <div className="px-1 pb-1 pt-1">
            <Button variant="ghost" block onClick={resetBalance}>Reset balance</Button>
          </div>
        </Group>
      </div>

      <div className="grid gap-6">
        <Group title="Help">
          <LinkRow label="How to play" onClick={onOpenRules} />
          <LinkRow label="Provably fair" onClick={onOpenFairness} />
        </Group>

        <Group title="About">
          <Row label="Lucky Roll">
            <span className="text-[16px] leading-6 text-ink-3 tnum">Version {pkg.version}</span>
          </Row>
        </Group>
      </div>
    </div>
  );
};

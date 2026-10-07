import { HelpCircle } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { WalletDisplay } from '../ui/WalletDisplay';
import { LogoMark } from './Logo';

/**
 * Sticky bar: transparent at rest; once the page title scrolls under it (`condensed`),
 * a progressive fade appears and the compact title cross-fades in. Balance stays right.
 */
export const TopBar = ({ condensed, title, showHelp, onHelp }) => (
  <header className={`topbar ${condensed ? 'condensed' : ''}`}>
    <div className="topbar-inner">
      <div className="topbar-lead">
        <span className="topbar-brand text-ink-2" aria-hidden="true"><LogoMark size={26} /></span>
        <span className="compact-title t-card-title" aria-hidden={!condensed}>{title}</span>
      </div>
      <div className="topbar-actions">
        {showHelp && (
          <IconButton label="How to play" onClick={onHelp} data-keep>
            <HelpCircle size={22} strokeWidth={1.75} />
          </IconButton>
        )}
        <WalletDisplay />
      </div>
    </div>
  </header>
);

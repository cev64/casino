import { DESTINATIONS } from './destinations';
import { LogoLockup, LogoMark } from './Logo';

const NavLink = ({ dest, active, onNavigate }) => {
  const Icon = dest.icon;
  return (
    <a
      href={`#/${dest.id}`}
      className="nav-item pressable"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        onNavigate(dest.id);
      }}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      <span className="nav-label">{dest.label}</span>
    </a>
  );
};

/** < 600px: detached floating glass pill with a sliding indicator. */
export const BottomNav = ({ current, onNavigate }) => {
  const index = Math.max(0, DESTINATIONS.findIndex((d) => d.id === current));
  return (
    <nav className="bottom-nav glass-strong" aria-label="Primary" style={{ '--i': index, '--n': DESTINATIONS.length }}>
      <span className="nav-indicator" aria-hidden="true" />
      {DESTINATIONS.map((d) => (
        <NavLink key={d.id} dest={d} active={d.id === current} onNavigate={onNavigate} />
      ))}
    </nav>
  );
};

/** >= 600px: floating glass side rail (icons + labels 76px, lockup 220px from 1024px). */
export const SideRail = ({ current, onNavigate }) => {
  const index = Math.max(0, DESTINATIONS.findIndex((d) => d.id === current));
  return (
    <nav className="side-rail glass" aria-label="Primary" style={{ '--i': index }}>
      <div className="rail-logo text-ink">
        <span className="rail-logo-mark"><LogoMark size={30} /></span>
        <span className="rail-logo-lockup"><LogoLockup /></span>
      </div>
      <div className="rail-items">
        <span className="nav-indicator" aria-hidden="true" />
        {DESTINATIONS.map((d) => (
          <NavLink key={d.id} dest={d} active={d.id === current} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
};

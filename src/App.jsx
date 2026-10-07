import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BlackjackTable } from './components/blackjack/BlackjackTable';
import { CrapsTable } from './components/craps/CrapsTable';
import { Backdrop } from './components/ui/Backdrop';
import { ToastHost } from './components/ui/Toast';
import { BottomNav, SideRail } from './components/layout/Navigation';
import { TopBar } from './components/layout/TopBar';
import { getDestination } from './components/layout/destinations';
import { useDestination } from './components/layout/useDestination';
import { useOutOfChips } from './components/layout/useOutOfChips';
import { HistoryScreen } from './components/screens/HistoryScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { RulesSheet } from './components/screens/RulesSheet';
import { FairnessSheet } from './components/screens/FairnessSheet';

const isTyping = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/** Pixel value of the top safe-area inset (0 outside installed PWAs / notched phones). */
const readSafeTop = () => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
};

function App() {
  const [current, navigate] = useDestination();
  const dest = getDestination(current);
  useOutOfChips();

  const [rulesOpen, setRulesOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);

  // The game the rules sheet opens on: the visible table, else the last one played.
  const lastGame = useRef('blackjack');
  if (dest.game) lastGame.current = dest.id;
  const rulesGame = lastGame.current;

  const headRef = useRef(null);
  const mainRef = useRef(null);

  // Condense the top bar once the page title has scrolled under it.
  useEffect(() => {
    const head = headRef.current;
    if (!head || typeof IntersectionObserver === 'undefined') return undefined;
    const barH = 52 + readSafeTop();
    const io = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting && entry.boundingClientRect.top < barH),
      { rootMargin: `-${barH}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(head);
    return () => io.disconnect();
  }, []);

  // New destination: start at the top.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    setCondensed(false);
    document.title = `${dest.label} - Lucky Roll`;
  }, [dest.id, dest.label]);

  // Global keys: ? rules, 1 / 2 switch table. Ignored while typing or with an overlay open.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (document.documentElement.classList.contains('modal-lock')) return;
      if (e.key === '?') { e.preventDefault(); setRulesOpen(true); }
      else if (e.key === '1') navigateRef.current('blackjack');
      else if (e.key === '2') navigateRef.current('craps');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openRules = useCallback(() => setRulesOpen(true), []);
  const openFair = useCallback(() => setFairOpen(true), []);

  return (
    <div className="shell">
      <Backdrop />
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}
      >
        Skip to content
      </a>

      <SideRail current={current} onNavigate={navigate} />

      <div className="shell-main">
        <TopBar condensed={condensed} title={dest.label} showHelp={!!dest.game} onHelp={openRules} />

        <main id="main" ref={mainRef} tabIndex={-1} className="page">
          <div className="page-inner">
            <div ref={headRef} className="page-head">
              <div key={dest.id} className="page-head-text">
                <p className="t-micro">{dest.kicker}</p>
                <h1 className="t-display">{dest.label}</h1>
              </div>
            </div>

            {/* Both tables stay mounted so hands and bets survive switching. */}
            <section className="screen" hidden={current !== 'blackjack'} aria-label="Blackjack table">
              <BlackjackTable active={current === 'blackjack'} />
            </section>
            <section className="screen" hidden={current !== 'craps'} aria-label="Craps table">
              <CrapsTable active={current === 'craps'} />
            </section>

            {current === 'history' && (
              <section className="screen" aria-label="History"><HistoryScreen /></section>
            )}
            {current === 'settings' && (
              <section className="screen" aria-label="Settings">
                <SettingsScreen onOpenRules={openRules} onOpenFairness={openFair} />
              </section>
            )}
          </div>
        </main>
      </div>

      <BottomNav current={current} onNavigate={navigate} />

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} game={rulesGame} />
      <FairnessSheet open={fairOpen} onClose={() => setFairOpen(false)} />
      <ToastHost />
    </div>
  );
}

export default App;

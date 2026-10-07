import { useEffect, useState } from 'react';
import { create } from 'zustand';

/**
 * Toasts: short, calm, factual. Optional single action (e.g. Undo).
 *   toast('Bets cleared', { action: { label: 'Undo', onClick: restore } })
 *   toast('Not enough balance', { tone: 'bad' })
 */
let nextId = 1;

export const useToastStore = create((set, get) => ({
  toasts: [],
  push: (message, { action, tone = 'neutral', duration } = {}) => {
    const id = nextId++;
    const ms = duration ?? (action ? 5000 : 2600);
    set({ toasts: [...get().toasts.slice(-2), { id, message, action, tone, ms }] });
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message, opts) => useToastStore.getState().push(message, opts);

const TONE = { neutral: 'text-ink', good: 'text-good', bad: 'text-bad', warn: 'text-warn' };

const ToastItem = ({ t }) => {
  const dismiss = useToastStore((s) => s.dismiss);
  const [state, setState] = useState('enter');

  useEffect(() => {
    const raf = requestAnimationFrame(() => setState('shown'));
    const hide = setTimeout(() => setState('exit'), t.ms);
    return () => { cancelAnimationFrame(raf); clearTimeout(hide); };
  }, [t.ms]);

  useEffect(() => {
    if (state !== 'exit') return undefined;
    const done = setTimeout(() => dismiss(t.id), 200);
    return () => clearTimeout(done);
  }, [state, dismiss, t.id]);

  const shown = state === 'shown';
  return (
    <div
      role="status"
      className="glass-strong pointer-events-auto flex items-center gap-3 min-h-[48px] pl-5 pr-2 py-1.5 rounded-full max-w-[min(92vw,440px)]"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(12px) scale(.96)',
        transition: shown
          ? 'transform .35s var(--spring), opacity .25s var(--ease)'
          : 'transform .2s var(--ease), opacity .2s var(--ease)',
      }}
    >
      <span className={`text-[15px] font-medium ${TONE[t.tone] || TONE.neutral} ${t.action ? '' : 'pr-3'}`}>{t.message}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => { t.action.onClick?.(); setState('exit'); }}
          className="pressable ml-auto min-h-[36px] px-3.5 rounded-full bg-fill hover:bg-fill-2 text-ink text-[15px] font-semibold"
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
};

/** Mount once near the app root. Sits above the bottom nav on phones, and above any
 *  sticky control dock that sets --toast-lift on <html>. */
export const ToastHost = () => {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4
        bottom-[calc(var(--nav-h)+28px+var(--safe-bottom)+var(--toast-lift,0px))] nav:bottom-[calc(24px+var(--toast-lift,0px))]"
    >
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
};

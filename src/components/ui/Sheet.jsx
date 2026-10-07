import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { useOverlayLock } from '../../hooks/useOverlayLock';

const EXIT_MS = 240;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal sheet. Centred card on wide screens, bottom sheet on phones.
 * - The container never fades (backdrop-filter would snap); the scrim and the sheet fade themselves.
 * - Esc closes, focus is trapped inside and returned to the trigger on close.
 * - Phones: drag the grabber/header down to dismiss (120px or a flick > 0.6px/ms).
 */
export const Sheet = ({ open, onClose, title, label, children, footer, className = '' }) => {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef(null);
  const returnFocus = useRef(null);
  const drag = useRef(null);
  const titleId = useId();

  useOverlayLock(mounted);

  // Mount → next frame add .open (so the transition runs); close → remove .open, unmount after exit.
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => {
      setMounted(false);
      setDragY(0);
      returnFocus.current?.focus?.();
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Initial focus + Esc + focus trap
  useEffect(() => {
    if (!shown) return undefined;
    const sheet = sheetRef.current;
    const first = sheet?.querySelector('[data-autofocus]') || sheet;
    first?.focus?.({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !sheet) return;
      const nodes = [...sheet.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) { e.preventDefault(); return; }
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === sheet)) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [shown, onClose]);

  // Drag to dismiss (touch / pen only, phones only)
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || window.innerWidth >= 600) return;
    drag.current = { y0: e.clientY, t0: performance.now(), lastY: e.clientY, lastT: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y0;
    drag.current.v = (e.clientY - drag.current.lastY) / Math.max(1, performance.now() - drag.current.lastT);
    drag.current.lastY = e.clientY;
    drag.current.lastT = performance.now();
    setDragY(dy >= 0 ? dy : -Math.sqrt(-dy) * 4);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const { v = 0 } = drag.current;
    drag.current = null;
    if (dragY > 120 || v > 0.6) onClose?.();
    else setDragY(0);
  };

  if (!mounted) return null;

  const dragging = drag.current !== null && dragY !== 0;
  const sheetStyle = dragY ? { transform: `translateY(${dragY}px)` } : undefined;
  const scrimStyle = dragY > 0 ? { '--scrim-opacity': Math.max(0, 1 - dragY / 400) } : undefined;

  return createPortal(
    <div
      className={`modal ${shown ? 'open' : ''}`}
      style={scrimStyle}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? label : undefined}
        tabIndex={-1}
        className={`sheet glass-strong outline-none ${dragging ? 'dragging' : ''} ${className}`}
        style={sheetStyle}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="nav:hidden flex justify-center pt-2.5" aria-hidden="true">
            <span className="w-9 h-[5px] rounded-full bg-fill-2" />
          </div>
          <div className="flex items-center gap-2 pl-6 pr-3 pt-3 nav:pt-4 pb-2">
            {title && <h2 id={titleId} className="t-title flex-1 min-w-0 truncate">{title}</h2>}
            {!title && <span className="flex-1" />}
            <IconButton label="Close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
              <X size={22} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
        {footer && <div className="shrink-0 px-6 pb-6 pt-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

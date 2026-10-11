import { useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD = 6; // px a press must travel before it becomes a drag (a tap still selects)
const TOUCH_LIFT = 44; // on touch the chip rides above the finger, so the target stays visible

/** The bet spot under a point on screen, or null. */
const spotAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  const spot = el?.closest?.('.cr-spot[data-spot]');
  if (!spot || spot.hidden || spot.closest('[hidden]')) return null;
  return spot.getAttribute('data-spot');
};

/**
 * Drag a chip from the rack onto a bet spot. Pointer events, so mouse, touch and pen all work
 * (HTML5 drag and drop does not fire on touch screens).
 *
 *   const { drag, ghostRef, startDrag } = useChipDrag({ enabled, check, onPick, onDrop });
 *   startDrag(value, pointerDownEvent)   from the rack's onPointerDown
 *   drag = { value, spot, error }        while dragging (null otherwise), for the highlight
 *   ghostRef                             the floating chip; positioned without re-rendering
 *
 * `check(spot, value)` returns why the chip can't go there (or null). `onDrop(spot, value)`
 * places it. Dropping outside the table, pointercancel and Escape cancel the drag.
 */
export const useChipDrag = ({ enabled, check, onPick, onDrop }) => {
  const [drag, setDrag] = useState(null);
  const ghostRef = useRef(null);
  const session = useRef(null);
  const latest = useRef({ enabled, check, onPick, onDrop });
  latest.current = { enabled, check, onPick, onDrop };

  const position = useCallback(() => {
    const s = session.current;
    const el = ghostRef.current;
    if (!s || !el) return;
    el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`;
  }, []);

  const end = useCallback(() => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    s.cleanup();
    document.documentElement.classList.remove('cr-dragging');
    setDrag(null);
  }, []);

  const startDrag = useCallback((value, e) => {
    if (session.current || !latest.current.enabled()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const source = e.currentTarget;
    const pointerId = e.pointerId;
    const lift = e.pointerType === 'mouse' ? 0 : TOUCH_LIFT;
    const s = {
      value, pointerId, active: false, spot: null,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY - lift, lift,
      cleanup: () => {},
    };

    const update = (ev) => {
      s.x = ev.clientX;
      s.y = ev.clientY - s.lift;
      position();
      const spot = spotAt(s.x, s.y);
      if (spot !== s.spot) {
        s.spot = spot;
        setDrag({ value, spot, error: spot ? latest.current.check(spot, value) : null });
      }
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!s.active) {
        if (Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) < DRAG_THRESHOLD) return;
        s.active = true;
        try { source.setPointerCapture?.(pointerId); } catch { /* the pointer may already be gone */ }
        document.documentElement.classList.add('cr-dragging');
        latest.current.onPick?.(value);
        setDrag({ value, spot: null, error: null });
      }
      ev.preventDefault();
      update(ev);
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const { active, spot } = s;
      end();
      if (!active) return; // a plain tap: the rack's click selects the chip
      // the click that follows a drag must not do anything else
      const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (spot) latest.current.onDrop(spot, value);
    };

    const onCancel = (ev) => { if (ev.pointerId === pointerId) end(); };
    const onKey = (ev) => { if (ev.key === 'Escape' && s.active) { ev.preventDefault(); ev.stopPropagation(); end(); } };
    // touch: stop the page from scrolling once the drag has started
    const onTouchMove = (ev) => { if (s.active && ev.cancelable) ev.preventDefault(); };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    s.cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('touchmove', onTouchMove);
    };
    session.current = s;
  }, [end, position]);

  // place the ghost as soon as it mounts
  useEffect(() => { if (drag) position(); }, [drag, position]);
  // never leave listeners behind
  useEffect(() => end, [end]);

  return { drag, ghostRef, startDrag, cancelDrag: end };
};

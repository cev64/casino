import { useEffect } from 'react';

// Shared "open overlays" counter: while any sheet, dialog or menu is open the
// ambient backdrop drift pauses (see .modal-lock in tokens.css).
let openCount = 0;

export const useOverlayLock = (active) => {
  useEffect(() => {
    if (!active) return undefined;
    openCount += 1;
    document.documentElement.classList.add('modal-lock');
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.documentElement.classList.remove('modal-lock');
    };
  }, [active]);
};

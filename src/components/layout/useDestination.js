import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_DESTINATION, isDestination } from './destinations';

const STORAGE_KEY = 'casino_last_destination';

const fromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return isDestination(id) ? id : null;
};

const readStored = () => {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return isDestination(id) ? id : null;
  } catch {
    return null;
  }
};

const writeStored = (id) => {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
};

/**
 * Current destination, kept in sync with location.hash so back/forward work.
 * Falls back to the last visited destination, then Blackjack.
 */
export const useDestination = () => {
  const [current, setCurrent] = useState(() => fromHash() || readStored() || DEFAULT_DESTINATION);

  // Normalise the URL on first paint without adding a history entry.
  useEffect(() => {
    if (fromHash() !== current) {
      window.history.replaceState(null, '', `#/${current}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const onPop = () => {
      const id = fromHash();
      if (id) setCurrent(id);
      else if (window.location.hash !== `#/${currentRef.current}`) {
        // Unknown hash (typed or pasted): keep the current screen and tidy the URL.
        window.history.replaceState(null, '', `#/${currentRef.current}`);
      }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  useEffect(() => { writeStored(current); }, [current]);

  const navigate = useCallback((id) => {
    if (!isDestination(id) || id === currentRef.current) return;
    window.history.pushState(null, '', `#/${id}`);
    setCurrent(id);
  }, []);

  return [current, navigate];
};

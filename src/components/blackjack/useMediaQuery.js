import { useEffect, useState } from 'react';

/** Subscribes to a media query. Safe during tests / SSR (returns `fallback`). */
export const useMediaQuery = (query, fallback = false) => {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
};

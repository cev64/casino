import { useEffect, useRef } from 'react';
import { haptic } from '../../stores/settingsStore';

/**
 * A win is shown by the table itself (result line, chips moving). This component only adds a
 * quiet haptic tick when `show` turns on - heavier for larger payouts - and renders nothing.
 */
export const WinCelebration = ({ show, payout = 0 }) => {
  const wasShown = useRef(false);

  useEffect(() => {
    if (show && !wasShown.current) {
      haptic(payout >= 200 ? [14, 40, 14] : 10);
    }
    wasShown.current = !!show;
  }, [show, payout]);

  return null;
};

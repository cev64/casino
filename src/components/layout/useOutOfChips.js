import { useEffect } from 'react';
import { toast } from '../ui/Toast';
import { formatMoney } from '../ui/RollingNumber';
import { useWalletStore } from '../../stores/walletStore';
import { haptic } from '../../stores/settingsStore';

const SETTLE_MS = 1500; // let in-flight payouts land before deciding the player is out
const MIN_CHIP = 1;
const STARTING_BALANCE = 1000;

/**
 * Tables cannot offer a way out when every chip is disabled, so the shell does: once the balance
 * has stayed below the smallest chip for a moment, offer a reset (with Undo) in a toast. It is
 * shown once per occurrence and re-arms only when the balance is back at a playable amount.
 */
export const useOutOfChips = () => {
  useEffect(() => {
    let armed = true;
    let timer = null;

    const check = () => {
      timer = null;
      const { balance } = useWalletStore.getState();
      if (!armed || balance >= MIN_CHIP) return;
      armed = false;
      toast('Out of chips', {
        duration: 9000,
        action: {
          label: `Reset to ${formatMoney(STARTING_BALANCE)}`,
          onClick: () => {
            const previous = useWalletStore.getState().balance;
            useWalletStore.getState().reset();
            haptic(10);
            toast('Balance reset', {
              action: { label: 'Undo', onClick: () => useWalletStore.getState().setBalance(previous) },
            });
          },
        },
      });
    };

    const onBalance = (balance) => {
      if (balance >= MIN_CHIP) {
        armed = true;
        if (timer) { clearTimeout(timer); timer = null; }
      } else if (armed && !timer) {
        timer = setTimeout(check, SETTLE_MS);
      }
    };

    onBalance(useWalletStore.getState().balance);
    const unsubscribe = useWalletStore.subscribe((s, prev) => {
      if (s.balance !== prev.balance) onBalance(s.balance);
    });
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, []);
};

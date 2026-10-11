import { create } from 'zustand';
import { getWalletBalance, setWalletBalance, updateWalletBalance, resetWallet } from '../utils/localStorage';

export const useWalletStore = create((set, get) => ({
  balance: getWalletBalance(),

  deposit: (amount) => {
    const newBalance = updateWalletBalance(amount);
    set({ balance: newBalance });
    return newBalance;
  },

  withdraw: (amount) => {
    const currentBalance = get().balance;
    if (currentBalance >= amount) {
      const newBalance = updateWalletBalance(-amount);
      set({ balance: newBalance });
      return { success: true, balance: newBalance };
    }
    return { success: false, balance: currentBalance, error: 'Insufficient funds' };
  },

  setBalance: (amount) => {
    setWalletBalance(amount);
    set({ balance: amount });
  },

  reset: () => {
    const newBalance = resetWallet();
    set({ balance: newBalance });
    return newBalance;
  },

  /*
   * Display only. `held` is money already in `balance` (and saved) that the balance pill
   * doesn't show yet because its chips are still flying to it. Never persisted, so a reload
   * mid-flight shows the full balance. `arrivals` counts landings (the pill bumps on each).
   */
  held: 0,
  arrivals: 0,
  hold: (amount) => set((s) => ({ held: s.held + Math.max(0, amount) })),
  release: (amount = Infinity) => set((s) => ({ held: Math.max(0, s.held - amount), arrivals: s.arrivals + 1 })),

  refresh: () => {
    const balance = getWalletBalance();
    set({ balance });
    return balance;
  }
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage for Node environment
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = val; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); })
};
globalThis.localStorage = localStorageMock;

// Mock crypto.randomUUID
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  let counter = 0;
  globalThis.crypto.randomUUID = () => `uuid-${++counter}`;
}

const {
  getWalletBalance,
  setWalletBalance,
  updateWalletBalance,
  resetWallet,
  getGameHistory,
  addGameToHistory,
  clearGameHistory,
  getSettings,
  updateSettings,
  clearAllData
} = await import('../localStorage');

describe('localStorage utilities', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.clearAllMocks();
  });

  describe('wallet', () => {
    it('should return default balance of 1000 when no data', () => {
      const balance = getWalletBalance();
      expect(balance).toBe(1000);
    });

    it('should set and get wallet balance', () => {
      setWalletBalance(500);
      const balance = getWalletBalance();
      expect(balance).toBe(500);
    });

    it('should update balance by adding amount', () => {
      setWalletBalance(1000);
      const newBalance = updateWalletBalance(250);
      expect(newBalance).toBe(1250);
    });

    it('should update balance by subtracting amount', () => {
      setWalletBalance(1000);
      const newBalance = updateWalletBalance(-300);
      expect(newBalance).toBe(700);
    });

    it('should prevent negative balance (clamp to 0)', () => {
      setWalletBalance(100);
      const newBalance = updateWalletBalance(-500);
      expect(newBalance).toBe(0);
    });

    it('should reset wallet to 1000', () => {
      setWalletBalance(5000);
      const balance = resetWallet();
      expect(balance).toBe(1000);
      expect(getWalletBalance()).toBe(1000);
    });
  });

  describe('game history', () => {
    it('should return empty array when no history', () => {
      expect(getGameHistory()).toEqual([]);
    });

    it('should add game to history', () => {
      addGameToHistory({ game: 'blackjack', outcome: 'win', payout: 50 });
      const history = getGameHistory();
      expect(history.length).toBe(1);
      expect(history[0].game).toBe('blackjack');
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('id');
    });

    it('should prepend new entries (most recent first)', () => {
      addGameToHistory({ game: 'first' });
      addGameToHistory({ game: 'second' });
      const history = getGameHistory();
      expect(history[0].game).toBe('second');
      expect(history[1].game).toBe('first');
    });

    it('should limit history to 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        addGameToHistory({ game: `game-${i}` });
      }
      const history = getGameHistory();
      expect(history.length).toBe(100);
    });

    it('should clear game history', () => {
      addGameToHistory({ game: 'test' });
      clearGameHistory();
      expect(getGameHistory()).toEqual([]);
    });
  });

  describe('settings', () => {
    it('should return default settings when none saved', () => {
      const settings = getSettings();
      expect(settings.soundEnabled).toBe(true);
      expect(settings.animationSpeed).toBe('normal');
      expect(settings.theme).toBe('system');
    });

    it('should update individual settings', () => {
      updateSettings({ soundEnabled: false });
      const settings = getSettings();
      expect(settings.soundEnabled).toBe(false);
      expect(settings.theme).toBe('system'); // Other settings unchanged
    });
  });

  describe('clearAllData', () => {
    it('should remove all casino data', () => {
      setWalletBalance(5000);
      addGameToHistory({ game: 'test' });
      updateSettings({ soundEnabled: false });

      clearAllData();

      // Everything should be back to defaults
      expect(getWalletBalance()).toBe(1000); // Returns default
      expect(getGameHistory()).toEqual([]);
    });
  });
});

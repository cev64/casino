/**
 * LocalStorage utilities for persisting game data
 */

const STORAGE_KEYS = {
  WALLET: 'casino_wallet',
  GAME_HISTORY: 'casino_game_history',
  SETTINGS: 'casino_settings',
  FAIR_SESSIONS: 'casino_fair_sessions'
};

const DEFAULT_BALANCE = 1000;

// Wallet functions
export const getWalletBalance = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.WALLET);
    if (!stored) {
      setWalletBalance(DEFAULT_BALANCE);
      return DEFAULT_BALANCE;
    }
    return JSON.parse(stored).balance;
  } catch (error) {
    console.error('Error reading wallet balance:', error);
    return DEFAULT_BALANCE;
  }
};

export const setWalletBalance = (balance) => {
  try {
    localStorage.setItem(STORAGE_KEYS.WALLET, JSON.stringify({
      balance,
      lastUpdated: new Date().toISOString()
    }));
    return true;
  } catch (error) {
    console.error('Error setting wallet balance:', error);
    return false;
  }
};

// Fix 1.5: prevent balance from going negative
export const updateWalletBalance = (amount) => {
  const currentBalance = getWalletBalance();
  const newBalance = Math.max(0, currentBalance + amount);
  setWalletBalance(newBalance);
  return newBalance;
};

export const resetWallet = () => {
  setWalletBalance(DEFAULT_BALANCE);
  return DEFAULT_BALANCE;
};

// Game history functions
export const getGameHistory = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.GAME_HISTORY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading game history:', error);
    return [];
  }
};

export const addGameToHistory = (game) => {
  try {
    const history = getGameHistory();
    const newEntry = {
      ...game,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID()
    };

    // Keep only last 100 games
    const updatedHistory = [newEntry, ...history].slice(0, 100);
    localStorage.setItem(STORAGE_KEYS.GAME_HISTORY, JSON.stringify(updatedHistory));
    return true;
  } catch (error) {
    console.error('Error adding game to history:', error);
    return false;
  }
};

export const clearGameHistory = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.GAME_HISTORY, JSON.stringify([]));
    return true;
  } catch (error) {
    console.error('Error clearing game history:', error);
    return false;
  }
};

// Settings functions
export const getSettings = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return stored ? JSON.parse(stored) : {
      soundEnabled: true,
      animationSpeed: 'normal',
      theme: 'system'
    };
  } catch (error) {
    console.error('Error reading settings:', error);
    return { soundEnabled: true, animationSpeed: 'normal', theme: 'system' };
  }
};

export const updateSettings = (settings) => {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Error updating settings:', error);
    return getSettings();
  }
};

// Provably fair session management
export const saveFairSession = (sessionId, sessionData) => {
  try {
    const sessions = getAllFairSessions();
    sessions[sessionId] = {
      ...sessionData,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.FAIR_SESSIONS, JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.error('Error saving fair session:', error);
    return false;
  }
};

export const getFairSession = (sessionId) => {
  try {
    const sessions = getAllFairSessions();
    return sessions[sessionId] || null;
  } catch (error) {
    console.error('Error getting fair session:', error);
    return null;
  }
};

export const getAllFairSessions = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FAIR_SESSIONS);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error getting fair sessions:', error);
    return {};
  }
};

export const clearAllData = () => {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (error) {
    console.error('Error clearing all data:', error);
    return false;
  }
};

import { create } from 'zustand';
import { getGameHistory, addGameToHistory, clearGameHistory } from '../utils/localStorage';

// Same key as STORAGE_KEYS.GAME_HISTORY in utils/localStorage.js (used to restore after Undo).
const HISTORY_KEY = 'casino_game_history';

export const useGameStore = create((set, get) => ({
  currentGame: null,
  gameHistory: getGameHistory(),
  isPlaying: false,

  setCurrentGame: (game) => set({ currentGame: game, isPlaying: !!game }),

  endGame: (result) => {
    const game = get().currentGame;
    if (game) {
      const gameRecord = {
        ...game,
        ...result,
        endedAt: new Date().toISOString()
      };
      addGameToHistory(gameRecord);
      set({
        currentGame: null,
        isPlaying: false,
        gameHistory: getGameHistory()
      });
    }
  },

  refreshHistory: () => {
    set({ gameHistory: getGameHistory() });
  },

  /** Empties the history and returns the previous records so the caller can offer Undo. */
  clearHistory: () => {
    const previous = getGameHistory();
    clearGameHistory();
    set({ gameHistory: [] });
    return previous;
  },

  /** Puts records back (Undo for clearHistory). */
  restoreHistory: (records) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(Array.isArray(records) ? records : []));
    } catch (error) {
      console.error('Error restoring game history:', error);
    }
    set({ gameHistory: getGameHistory() });
  }
}));

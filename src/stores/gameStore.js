import { create } from 'zustand';
import { getGameHistory, addGameToHistory } from '../utils/localStorage';
import { reinsertRemoved, removeRecords } from '../components/screens/historyModel';

// Same key as STORAGE_KEYS.GAME_HISTORY in utils/localStorage.js (used to restore after Undo).
const HISTORY_KEY = 'casino_game_history';

const writeHistory = (records) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('Error saving game history:', error);
  }
};

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

  /**
   * Removes history records: only one game's when `game` is given, otherwise all. Returns the
   * removed records with their positions so the caller can offer Undo via restoreHistory.
   */
  clearHistory: (game = null) => {
    const { kept, removed } = removeRecords(getGameHistory(), game);
    writeHistory(kept);
    set({ gameHistory: getGameHistory() });
    return removed;
  },

  /** Undo for clearHistory: puts the removed records back where they were. */
  restoreHistory: (removed) => {
    writeHistory(reinsertRemoved(getGameHistory(), removed));
    set({ gameHistory: getGameHistory() });
  }
}));

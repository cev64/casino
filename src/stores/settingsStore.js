import { create } from 'zustand';
import { getSettings, updateSettings } from '../utils/localStorage';
import { setSoundEnabled } from '../utils/sounds';

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');

  // Browser chrome colour: follow a forced theme, otherwise the OS preference.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    const effective = theme === 'light' || theme === 'dark' ? theme : scheme;
    meta.content = effective === 'dark' ? '#0A1122' : '#F4F6FB';
  });
};

const initial = (() => {
  const s = getSettings() || {};
  return {
    theme: s.theme || 'system', // 'system' | 'light' | 'dark'
    sound: s.soundEnabled ?? s.sound ?? true,
    haptics: s.haptics ?? true,
  };
})();

applyTheme(initial.theme);
setSoundEnabled(initial.sound);

export const useSettingsStore = create((set) => ({
  ...initial,
  setTheme: (theme) => {
    applyTheme(theme);
    updateSettings({ theme });
    set({ theme });
  },
  setSound: (sound) => {
    setSoundEnabled(sound);
    updateSettings({ soundEnabled: sound });
    set({ sound });
  },
  setHaptics: (haptics) => {
    updateSettings({ haptics });
    set({ haptics });
  },
}));

/** Short vibration if the user allows haptics and the device supports it. */
export const haptic = (pattern = 10) => {
  if (!useSettingsStore.getState().haptics) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
};

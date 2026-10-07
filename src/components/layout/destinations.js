import { Spade, Dices, History, Settings } from 'lucide-react';

/** Top-level destinations. `kicker` is the micro label above the page title. */
export const DESTINATIONS = [
  { id: 'blackjack', label: 'Blackjack', icon: Spade, kicker: 'Table', game: true },
  { id: 'craps', label: 'Craps', icon: Dices, kicker: 'Table', game: true },
  { id: 'history', label: 'History', icon: History, kicker: 'Results' },
  { id: 'settings', label: 'Settings', icon: Settings, kicker: 'Preferences' },
];

export const DEFAULT_DESTINATION = 'blackjack';

export const getDestination = (id) => DESTINATIONS.find((d) => d.id === id) || DESTINATIONS[0];
export const isDestination = (id) => DESTINATIONS.some((d) => d.id === id);

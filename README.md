# Lucky Roll

Blackjack and craps in the browser, with play money and provably fair randomness. Everything runs client-side; there is no account and no server.

## Features

- **Blackjack.** Six-deck shoe, dealer stands on soft 17, blackjack pays 3 to 2. Dealer peeks for blackjack. Hit, stand, double (also after a split), split up to four hands, insurance, even money and late surrender.
- **Craps.** Pass and don't pass, come and don't come with odds and lay odds (3-4-5x), place, Big 6 and 8, field, hardways and one-roll bets, with a dealer puck and a shooter's point. Tap to bet; press and hold or right-click to take a bet down.
- **Provably fair.** Every shuffle and roll is derived from `SHA-256(serverSeed:clientSeed:nonce)`. The Provably fair sheet in Settings recomputes a roll or the opening cards of a shoe from seeds you paste in.
- **History.** Results grouped by day with net result, win rate and a running chart. Clearing history can be undone.
- **Settings.** System, light or dark theme, sound, haptics, and a balance reset that can be undone.
- **Both tables stay live.** Switching between Blackjack and Craps keeps your hand and placed bets.

### Keyboard

| Key | Action |
|---|---|
| `1` / `2` | Switch to Blackjack / Craps |
| `?` | Open the rules for the current game |
| `Esc` | Close a sheet |
| `←` / `→` | Choose a chip |

Blackjack: `Enter` deal or deal again, `H` hit, `S` stand, `D` double, `P` split, `U` surrender, `Y` / `N` insurance, `R` rebet, `C` clear, `Backspace` remove the last chip.

Craps: `Space` or `R` roll, `U` or `Backspace` undo the last bet, `C` clear, `B` rebet, `Delete` on a focused spot takes that bet down.

## Design

The interface follows the Fluid Glass system described in [`docs/FLUID_GLASS_DESIGN_GUIDE.md`](docs/FLUID_GLASS_DESIGN_GUIDE.md): content on frosted glass over a quiet ambient backdrop, one accent per view, springy and interruptible motion, and no motion at all under reduced-motion settings. Tokens live in `src/styles/tokens.css`; the cards, chips, dice and felt are drawn as physical objects and keep their real-world colours.

## Stack

React 18, Vite 6, Tailwind CSS 3, Framer Motion, Zustand, Lucide icons. Fonts (Inter, Barlow Condensed) are bundled locally.

## Scripts

```bash
npm install
npm run dev       # dev server
npm test          # unit tests (Vitest)
npm run build     # production build in dist/
npm run preview   # serve the build
npm run deploy    # build and publish dist/ to GitHub Pages
```

The app is served from `/casino/` (see `base` in `vite.config.js`).

## Layout

```
src/
  App.jsx                 shell: navigation, top bar, sheets
  components/
    layout/               navigation, top bar, logo
    screens/              history, settings, rules, provably fair
    blackjack/ craps/     the tables
    ui/                   buttons, sheet, toast, cards, chips, dice, felt
  lib/                    game engines
  stores/                 wallet, settings, game history
  utils/                  provably fair, storage, sound
  styles/                 tokens and per-area stylesheets
```

Balance, history and settings are stored in the browser's `localStorage`.

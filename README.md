# Cascade

Cascade is a browser Klondike solitaire in Draw Three mode. Build four foundations from Ace to King, uncover the tableau, and finish with a cascade of bouncing cards that paints the felt table.

## Run

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser; there are no accounts, services, or downloaded assets.

## Production

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to any static host, including a subdirectory.

## Controls

- Drag a card or an alternating descending run onto a legal pile. A brass outline marks the target.
- Double-click or double-tap an exposed tableau card or the waste's front card to send it to a foundation.
- Click or tap the stock to turn three cards. Only the front card plays. An empty stock recycles the waste, with unlimited passes.
- Use the bottom controls to start again, return to the menu, or toggle sound.
- Navigate menus with Up/Down or W/S; activate with Enter/Space. Escape returns from the instructions.
- After winning, press anywhere to start a fresh deal.
- Backquote toggles the read-only engine debug overlay.

Sound unlocks on the first interaction. Each session starts fresh; there is no undo, score, or timer.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The unit suite covers dealing, Draw Three sets and recycling, move rules, pointer gestures, menus, victory timing, physics, and rendering. The Simple 2D engine owns the canvas fit, frame clock, input, synthesized audio, and diagnostics. The immutable game state and automation interface are exported from `src/game.ts`; automation is accessed through an engine instance's `debug` and `apply` APIs.

The `showcase/` directory contains screenshots and a recording captured from the game's own drawing during live play.

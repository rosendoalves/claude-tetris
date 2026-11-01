# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Classic Tetris implemented in vanilla JavaScript with HTML5 Canvas and CSS. No dependencies, no build step, no package.json. Game logic lives in `game.js`; pure scoring rules live in `scoring.js`.

## Running the game

There is no build or install step. Open `index.html` directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Tests for the pure scoring and hold modules run with Node's built-in runner (no dependencies):

```bash
node --test
```

There is no linter configured in this repo.

## Architecture

Seven files, each with one responsibility:

- `index.html` — DOM structure: the `#board` canvas (300×600, 10×20 cells at `BLOCK=30`), the `#hold-canvas` and `#next-canvas` previews, the HUD panel (score/lines/level), and the pause/game-over `#overlay`, and the `#feedback` layer over the board (inside `.board-wrap`) that shows achievement text.
- `style.css` — dark/retro visual theme, driven by CSS variables in `:root` (Dark, default) overridden by `[data-theme='light']`. The `#theme-toggle` button (wired in `game.js`) flips `data-theme` on `<html>` and persists the choice in `localStorage` (`theme`); `drawGrid` reads the `--grid` variable via `gridColor`. Add new colors as variables for both themes.
- `scoring.js` — pure scoring logic (no DOM): `SCORE_VALUES`, `createScoringState`, `isTSpin`, `isBoardEmpty`, `scoreClear`. Loaded before `game.js`; also `require`-able from Node.
- `scoring.test.js` — `node:test` suite for `scoring.js`.
- `hold.js` — pure hold logic (no DOM): `createHoldState`, `useHold`, `unlockHold`. Loaded before `game.js`; also `require`-able from Node.
- `hold.test.js` — `node:test` suite for `hold.js`.
- `game.js` — all game state and logic, structured around a single `requestAnimationFrame` loop.

### Core state

Module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...) hold all game state — there is no class or store; `init()` resets them all and kicks off the loop.

- `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece color index (1–7).
- `current` / `next` are `{ type, shape, x, y }`, where `shape` is a square matrix of color indices.
- Pieces rotate via `rotateCW` (matrix transpose), with wall-kick offsets `[0, -1, 1, -2, 2]` tried in `tryRotate`.

### Game loop flow

```
init() → createBoard(), spawn() first piece → requestAnimationFrame(loop)
loop(ts) → accumulate dt → if dt ≥ dropInterval: advance piece or lockPiece() → draw() → next frame
lockPiece() → isTSpin() → merge() into board → clearLines(tSpin) → unlockHold() → spawn() next piece
spawn() → if the new piece immediately collides → endGame()
```

Keyboard input (`keydown` listener) drives horizontal movement, `tryRotate`, `softDrop`, `hardDrop`, hold (`KeyC`, `ShiftLeft`, `ShiftRight`), and pause (`KeyP`); all input is ignored while `paused` or `gameOver`.

### Hold

`holdPiece()` stores the active piece in the `hold` state (`{ type, locked }`, rules in `hold.js`). An empty slot spawns the next queued piece; an occupied slot swaps in the held type via `createPiece`, so a held piece always re-enters unrotated at the spawn position (and clears `lastMoveWasRotation`). Only one hold per piece: the slot is `locked` (dimmed via `#hold-canvas.locked`) until the next `lockPiece()`. A swapped-in piece that collides ends the game, like `spawn()`.

### Scoring / leveling

Points for a clear are `((line + tSpinBonus) * combo + b2bBonus + perfectClearBonus) * level`, computed by `scoreClear` in `scoring.js` (a clear with no bonuses is `SCORE_VALUES.LINES[n] * level`). `combo` counts consecutive clearing locks (1 on the first, label shown from x2) and resets on a lock with no clear. A T-spin is a T piece whose last move was a rotation (`lastMoveWasRotation` in `game.js`, cleared by any successful move, gravity step or non-zero hard drop) with 3+ occupied diagonal corners (walls/floor count). Back-to-Back applies between consecutive difficult clears (Tetris or T-spin); a lock with no clear does not break it, a common clear does. Achievements are shown through `showAchievements` in `#feedback`. Hard drop adds 2 points/cell dropped, soft drop 1 point/row. `level` increases every 10 cleared lines, and `dropInterval` scales as `max(100, 1000 - (level - 1) * 90)` ms.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES` in `game.js`; every point value (`SCORE_VALUES`) in `scoring.js`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

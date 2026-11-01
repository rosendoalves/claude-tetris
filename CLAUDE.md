# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Classic Tetris implemented in vanilla JavaScript with HTML5 Canvas and CSS. No dependencies, no build step, no package.json. The entire game logic lives in a single file, `game.js`.

## Running the game

There is no build or install step. Open `index.html` directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no test suite and no linter configured in this repo.

## Architecture

Three files, each with one responsibility:

- `index.html` — DOM structure: the `#board` canvas (300×600, 10×20 cells at `BLOCK=30`), the `#next-canvas` preview, the HUD panel (score/lines/level), and the pause/game-over `#overlay`.
- `style.css` — dark/retro visual theme, driven by CSS variables in `:root` (Dark, default) overridden by `[data-theme='light']`. The `#theme-toggle` button (wired in `game.js`) flips `data-theme` on `<html>` and persists the choice in `localStorage` (`theme`); `drawGrid` reads the `--grid` variable via `gridColor`. Add new colors as variables for both themes.
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
lockPiece() → merge() into board → clearLines() → spawn() next piece
spawn() → if the new piece immediately collides → endGame()
```

Keyboard input (`keydown` listener) drives horizontal movement, `tryRotate`, `softDrop`, `hardDrop`, and pause (`KeyP`); all input is ignored while `paused` or `gameOver`.

### Scoring / leveling

`LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points/cell dropped, soft drop 1 point/row. `level` increases every 10 cleared lines, and `dropInterval` scales as `max(100, 1000 - (level - 1) * 90)` ms.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

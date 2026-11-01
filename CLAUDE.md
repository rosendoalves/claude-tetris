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

Tests for the pure scoring, hold, piece, power-up, ability and challenge modules run with Node's built-in runner (no dependencies):

```bash
node --test
```

There is no linter configured in this repo.

## Architecture

Sixteen files, each with one responsibility:

- `index.html` — DOM structure: the `#board` canvas (300×600, 10×20 cells at `BLOCK=30`), the `#hold-canvas` and `#next-canvas` previews, the HUD panel (score/lines/level), and the pause/game-over `#overlay`, and the `#feedback` layer over the board (inside `.board-wrap`) that shows achievement text.
- `style.css` — dark/retro visual theme, driven by CSS variables in `:root` (Dark, default) overridden by `[data-theme='light']`. The `#theme-toggle` button (wired in `game.js`) flips `data-theme` on `<html>` and persists the choice in `localStorage` (`theme`); `drawGrid` reads the `--grid` variable via `gridColor`. Add new colors as variables for both themes.
- `scoring.js` — pure scoring logic (no DOM): `SCORE_VALUES`, `createScoringState`, `isTSpin`, `isBoardEmpty`, `scoreClear`. Loaded before `game.js`; also `require`-able from Node.
- `scoring.test.js` — `node:test` suite for `scoring.js`.
- `pieces.js` — pure piece data and selection (no DOM): `PIECES` (types 1–12), `PIECE_SETTINGS` (the single place for spawn probabilities and the `NON_STANDARD_ENABLED` toggle), `rotateCW`, `collides`, `spawnX`, `pickPieceType(rng, settings)`, `previewOffset`. Loaded before `game.js`; also `require`-able from Node.
- `pieces.test.js` — `node:test` suite for `pieces.js`.
- `powerups.js` — pure power-up logic (no DOM): `POWERUP_SETTINGS` (`LINE_INTERVAL`, `FREEZE_MS`), `bomb`, `lightning`, `tint`, `gravity`, `settleFloating`, `applyPowerup`, `pickPowerup`, `rotatePowerupCell`, `randomFilledCell`, `crossedInterval`. Board effects return new boards. Loaded before `game.js`; also `require`-able from Node.
- `powerups.test.js` — `node:test` suite for `powerups.js`.
- `abilities.js` — pure ability logic (no DOM): `ABILITY_SETTINGS`, `ABILITIES`, `addEnergy`, `canOpenMenu`, `canUndo`, `isAbilityAvailable`, `tickTimers`, `effectiveDropInterval`. Loaded before `game.js`; also `require`-able from Node.
- `abilities.test.js` — `node:test` suite for `abilities.js`.
- `levels.js` — `LEVELS`, the challenge levels as pure data (`id`, `name`, `description`, `objective`, `rules`, `defeat`). Adding a level only needs a new entry (or `LEVELS.push(...)` at runtime): the start menu list is built from it. Loaded before `game.js`; also `require`-able from Node.
- `challenge.js` — pure challenge logic (no DOM): `FIXED_BLOCK` (13), `createProgress`, `evaluate`, `objectiveText`, `progressText`, `addGarbageRow`, `buildPresetBoard`, `countFixed`, `validateLevel`. Loaded before `game.js`; also `require`-able from Node.
- `challenge.test.js` — `node:test` suite for `challenge.js` and `levels.js`.
- `hold.js` — pure hold logic (no DOM): `createHoldState`, `useHold`, `unlockHold` (the hold state also stores a power-up kind). Loaded before `game.js`; also `require`-able from Node.
- `hold.test.js` — `node:test` suite for `hold.js`.
- `game.js` — all game state and logic, structured around a single `requestAnimationFrame` loop.

### Core state

Module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...) hold all game state — there is no class or store; `init(mode, level)` resets them all and kicks off the loop; it is not called at load (the start menu is shown instead and `running` is false, so keys are ignored until a mode is picked).

- `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece color index (1–12; the type doubles as the colour index).
- `current` / `next` are `{ type, shape, x, y }`, where `shape` is a square matrix of color indices.
- Pieces rotate via `rotateCW` (matrix transpose), with wall-kick offsets `[0, -1, 1, -2, 2]` tried in `tryRotate`.

### Game loop flow

```
load → showStartMenu() → (Normal | Desafío → level) → init(mode, level) → createBoard() (or preset), spawn() first piece → requestAnimationFrame(loop)
loop(ts) → accumulate dt → if dt ≥ dropInterval: advance piece or lockPiece() → draw() → next frame
lockPiece() → isTSpin() → merge() into board → clearLines(tSpin) → unlockHold() → spawn() next piece
spawn() → if the new piece immediately collides → endGame()
```

Keyboard input (`keydown` listener) drives horizontal movement, `tryRotate`, `softDrop`, `hardDrop`, hold (`KeyC`, `ShiftLeft`, `ShiftRight`), ability menu (`KeyE`), and pause (`KeyP`); all input is ignored while `paused` or `gameOver`.

### Non-standard pieces

Besides the 7 classic pieces, types 8–12 exist: PLUS (8), U (9), Y (10, 4×4 like I), SINGLE (11, 1×1) and RING (12, hollow, 8 blocks). They share the same system: square matrices rotated by `rotateCW`, locked with their own colour. `pickPieceType` rolls RING with `RING_CHANCE` and a PLUS/U/Y (one third each) with `PENTOMINO_CHANCE`; SINGLE never spawns randomly. With `PIECE_SETTINGS.NON_STANDARD_ENABLED = false` only classic pieces appear, uniformly, and the reward below is off. Reward: when one lock clears exactly 4 lines (`clearLines` returns the count) the active piece becomes a fresh SINGLE and `next` is not consumed. `drawPreview` centres the filled cells of any piece in the 4×4 preview box. T-spin stays T-only.

### Power-ups

Every `POWERUP_SETTINGS.LINE_INTERVAL` (10) cleared lines (several crossings in one clear count once) `clearLines` puts `powerup: { kind, r, c }` on a random filled cell of `next` (so the preview shows it). The cell follows `tryRotate` (`rotatePowerupCell`); it is drawn as an icon on the active piece (not the ghost) and in the previews; hold stores the kind and reapplies it to a random filled cell when the piece returns. On lock, `lockPiece` merges, runs `firePowerup` (board position = piece origin + cell) and only then the single `clearLines` call, so lines created by the effect clear and score normally; T-spin is computed before the merge. The effect name (BOMBA, RAYO, TINTE, GRAVEDAD, CONGELAR) is announced through `showAchievements`. Bomb, lightning and tint are followed by `settleFloating`, the "normal gravity" used here. ASSUMPTION: blocks that touch orthogonally (any colour) form one rigid cluster that falls until it rests on the floor or another cluster; GRAVEDAD is the different, per-column `gravity`. Freeze sets `freezeMs`: `loop` skips gravity while it counts down with `dt` (manual moves still work, countdown in `#freeze`); pause, game over and `init()` cancel it entirely via `cancelFreeze`. `features.powerups` disables the system per run.

### Abilities and energy

Clearing lines fills the `energy` bar (`ABILITY_SETTINGS.ENERGY_PER_LINES`, clamped to `ENERGY_REQUIRED`). `E` opens the menu only when the bar is full. The menu (`#ability-menu`) pauses through the same mechanics as `P` (`paused` plus `cancelAnimationFrame`) but shows no PAUSA overlay, ignores `P`, and does not cancel a freeze (`freezeMs` only ticks inside `loop`). `Escape` closes it keeping the energy; choosing an unavailable ability does nothing (the menu stays open, the button is disabled, energy is kept). A used ability empties the bar. Vision (20 s) shows `next` + 4 queued pieces in `#vision-canvas`; Intercambio replaces the active piece by a random different type that fits at spawn (power-up kind kept); Ralentizar doubles the effective gravity interval for 10 s via `effectiveDropInterval` without touching `dropInterval`; Deshacer restores the pre-lock `undoSnapshot` (board, scoring state, hold; score, lines and level are not rolled back, only drop points were earned) and is refused when there is no snapshot, the lock cleared lines or fired a power-up, or the respawn collides, with a single undo level; Hold extra calls `unlockHold` and needs a locked hold. Timers (`timers.visionMs`, `timers.slowMs`) tick only in `loop` with `dt` clamped to `MAX_TIMER_TICK_MS`, so pause and a long frame gap after resume cannot expire them; `init()` resets everything. `queue` holds the pieces after `next` (`next` stays a plain variable, `next + queue` is the upcoming window); a pending power-up goes on `next`.

### Modes and challenges

The start menu (`#start-menu`) offers Normal and Desafío; Desafío lists `LEVELS` (rebuilt every time it opens). Normal plays with every bonus system. A challenge runs the same engine with `features.nonStandard`, `features.powerups` and `features.abilities` set to false for that run (the settings objects are never mutated); hold works and speed follows the normal level curve. Reverse rotation (`rules.invertRotation`, `rotateCCW`) and hidden locked blocks (`rules.invisibleLocked`) apply only in their level. `progress` (`lines`, `elapsedMs`, `fixedRemaining`, `toppedOut`) is checked by `checkChallenge` after every lock and every frame; `evaluate` returns `'playing' | 'won' | 'lost'` and topping out always loses. `elapsedMs` and the garbage timer advance only in `loop` with the clamped `dt`, so pause stops them. Fixed blocks use board value 13 (`FIXED_BLOCK`, gray) and clear like any other block when their row completes; garbage rows reuse the same value. `addGarbage` pushes the board up (`addGarbageRow`), lifts the active piece if it now overlaps, and a defeat follows if blocks overflow the top or the piece ends above the board. The end overlay offers Reintentar and Volver a niveles in a challenge (Reiniciar and Menú in Normal).

### Hold

`holdPiece()` stores the active piece in the `hold` state (`{ type, locked }`, rules in `hold.js`). An empty slot spawns the next queued piece; an occupied slot swaps in the held type via `createPiece`, so a held piece always re-enters unrotated at the spawn position (and clears `lastMoveWasRotation`). Only one hold per piece: the slot is `locked` (dimmed via `#hold-canvas.locked`) until the next `lockPiece()`. A swapped-in piece that collides ends the game, like `spawn()`.

### Scoring / leveling

Points for a clear are `((line + tSpinBonus) * combo + b2bBonus + perfectClearBonus) * level`, computed by `scoreClear` in `scoring.js` (a clear with no bonuses is `SCORE_VALUES.LINES[n] * level`). `combo` counts consecutive clearing locks (1 on the first, label shown from x2) and resets on a lock with no clear. A T-spin is a T piece whose last move was a rotation (`lastMoveWasRotation` in `game.js`, cleared by any successful move, gravity step or non-zero hard drop) with 3+ occupied diagonal corners (walls/floor count). Back-to-Back applies between consecutive difficult clears (Tetris or T-spin); a lock with no clear does not break it, a common clear does. Achievements are shown through `showAchievements` in `#feedback`. Hard drop adds 2 points/cell dropped, soft drop 1 point/row. `level` increases every 10 cleared lines, and `dropInterval` scales as `max(100, 1000 - (level - 1) * 90)` ms.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS` in `game.js`; `LEVELS` in `levels.js`; `ABILITY_SETTINGS` in `abilities.js`; `POWERUP_SETTINGS` in `powerups.js`; `PIECES` and `PIECE_SETTINGS` in `pieces.js`; every point value (`SCORE_VALUES`) in `scoring.js`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

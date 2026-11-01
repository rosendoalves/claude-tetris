'use strict';

// Pure power-up logic (no DOM). Every board effect returns a NEW board and
// never mutates its input.
const POWERUP_SETTINGS = {
  LINE_INTERVAL: 10, // lines cleared between power-up pieces
  FREEZE_MS: 5000,
};

const POWERUP_KINDS = ['bomb', 'lightning', 'tint', 'gravity', 'freeze'];

// Names shown through showAchievements.
const POWERUP_NAMES = {
  bomb: 'BOMBA',
  lightning: 'RAYO',
  tint: 'TINTE',
  gravity: 'GRAVEDAD',
  freeze: 'CONGELAR',
};

function cloneBoard(board) {
  return board.map(row => [...row]);
}

// Clears the 3x3 area centred on (r, c).
function bomb(board, r, c) {
  const result = cloneBoard(board);
  for (let y = r - 1; y <= r + 1; y++) {
    for (let x = c - 1; x <= c + 1; x++) {
      if (y >= 0 && y < result.length && x >= 0 && x < result[0].length) result[y][x] = 0;
    }
  }
  return result;
}

// Clears the full row r and the full column c.
function lightning(board, r, c) {
  const result = cloneBoard(board);
  if (r >= 0 && r < result.length) result[r].fill(0);
  if (c >= 0 && c < result[0].length) for (const row of result) row[c] = 0;
  return result;
}

// Removes every block of the most frequent colour (lowest index on ties).
// An empty board is returned unchanged (as a copy).
function tint(board) {
  const counts = new Map();
  for (const row of board) for (const v of row) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  if (counts.size === 0) return cloneBoard(board);
  let best = null;
  for (const [colour, n] of counts) {
    if (best === null || n > counts.get(best) || (n === counts.get(best) && colour < best)) best = colour;
  }
  return board.map(row => row.map(v => (v === best ? 0 : v)));
}

// Per-column gravity: every block falls straight down, order kept per column.
function gravity(board) {
  const rows = board.length, cols = board[0].length;
  const result = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (board[r][c]) result[write--][c] = board[r][c];
    }
  }
  return result;
}

// "Normal gravity" used after Bomb, Lightning and Tint. ASSUMPTION: blocks that
// touch orthogonally (any colour) form one rigid cluster; clusters resting on
// the floor or on a supported cluster stay, all others fall together one row
// at a time until supported. (Per-column gravity() is the GRAVEDAD power-up.)
function settleFloating(board) {
  let current = cloneBoard(board);
  const rows = current.length, cols = current[0].length;
  for (;;) {
    const label = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!current[r][c] || label[r][c] !== -1) continue;
        const stack = [[r, c]];
        label[r][c] = n;
        while (stack.length) {
          const [y, x] = stack.pop();
          for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
            if (!current[ny][nx] || label[ny][nx] !== -1) continue;
            label[ny][nx] = n;
            stack.push([ny, nx]);
          }
        }
        n++;
      }
    }
    // A cluster is supported if it touches the floor or rests on a supported one.
    const supported = new Array(n).fill(false);
    for (let c = 0; c < cols; c++) if (label[rows - 1][c] >= 0) supported[label[rows - 1][c]] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          const here = label[r][c], below = label[r + 1][c];
          if (here >= 0 && below >= 0 && here !== below && supported[below] && !supported[here]) {
            supported[here] = true;
            changed = true;
          }
        }
      }
    }
    if (supported.every(Boolean)) return current;
    const moved = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!current[r][c]) continue;
        const l = label[r][c];
        moved[supported[l] ? r : r + 1][c] = current[r][c];
      }
    }
    current = moved;
  }
}

// Applies the board effect of a power-up fired at board cell (r, c).
// Freeze changes no blocks. Bomb, lightning and tint settle floating clusters.
function applyPowerup(kind, board, r, c) {
  switch (kind) {
    case 'bomb': return settleFloating(bomb(board, r, c));
    case 'lightning': return settleFloating(lightning(board, r, c));
    case 'tint': return settleFloating(tint(board));
    case 'gravity': return gravity(board);
    default: return cloneBoard(board);
  }
}

function pickPowerup(rng) {
  return POWERUP_KINDS[Math.floor(rng() * POWERUP_KINDS.length)];
}

// Follows a rotation of the (square) piece matrix: cell {r, c} -> new cell.
function rotatePowerupCell(cell, size, clockwise = true) {
  return clockwise
    ? { r: cell.c, c: size - 1 - cell.r }
    : { r: size - 1 - cell.c, c: cell.r };
}

// Random filled cell {r, c} of a shape matrix, or null for an empty shape.
function randomFilledCell(shape, rng) {
  const cells = [];
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) cells.push({ r, c });
  return cells.length ? cells[Math.floor(rng() * cells.length)] : null;
}

// True when the line total crossed a multiple of `interval`. Several crossings
// in one clear still count as a single pending power-up.
function crossedInterval(previousLines, newLines, interval = POWERUP_SETTINGS.LINE_INTERVAL) {
  return Math.floor(newLines / interval) > Math.floor(previousLines / interval);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    POWERUP_SETTINGS,
    POWERUP_KINDS,
    POWERUP_NAMES,
    bomb,
    lightning,
    tint,
    gravity,
    settleFloating,
    applyPowerup,
    pickPowerup,
    rotatePowerupCell,
    randomFilledCell,
    crossedInterval,
  };
}

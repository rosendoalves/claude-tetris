'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  POWERUP_SETTINGS, POWERUP_KINDS, bomb, lightning, tint, gravity, settleFloating,
  applyPowerup, pickPowerup, rotatePowerupCell, randomFilledCell, crossedInterval,
} = require('./powerups.js');

const ROWS = 20;
const COLS = 10;
const empty = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
const deepFreeze = b => { b.forEach(r => Object.freeze(r)); return Object.freeze(b); };
const filled = b => b.flat().filter(Boolean).length;

// Builds a board from the bottom: rows are strings, '.' empty, digit = colour.
function fromRows(strings) {
  const b = empty();
  strings.forEach((s, i) => {
    const r = ROWS - strings.length + i;
    [...s.padEnd(COLS, '.')].forEach((ch, c) => { if (ch !== '.') b[r][c] = Number(ch); });
  });
  return b;
}

test('settings are the documented defaults', () => {
  assert.deepEqual(POWERUP_SETTINGS, { LINE_INTERVAL: 10, FREEZE_MS: 5000 });
});

test('bomb clears the 3x3 area and nothing else, without mutating', () => {
  const board = empty().map(r => r.map(() => 1));
  const frozen = deepFreeze(board);
  const out = bomb(frozen, 10, 5);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const inside = Math.abs(r - 10) <= 1 && Math.abs(c - 5) <= 1;
    assert.equal(out[r][c], inside ? 0 : 1);
  }
  assert.equal(filled(frozen), ROWS * COLS);
});

test('bomb is clipped at the board edges', () => {
  const board = empty().map(r => r.map(() => 2));
  const out = bomb(board, 0, 0);
  assert.equal(filled(out), ROWS * COLS - 4);
  const corner = bomb(board, ROWS - 1, COLS - 1);
  assert.equal(filled(corner), ROWS * COLS - 4);
});

test('lightning clears its full row and column', () => {
  const board = deepFreeze(empty().map(r => r.map(() => 3)));
  const out = lightning(board, 7, 2);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    assert.equal(out[r][c], r === 7 || c === 2 ? 0 : 3);
  }
});

test('tint removes the most frequent colour, lowest index on ties, no-op when empty', () => {
  const board = fromRows(['1112233.', '1122.']);
  const out = tint(deepFreeze(board));
  assert.equal(out.flat().filter(v => v === 1).length, 0);
  assert.equal(out.flat().filter(v => v === 2).length, board.flat().filter(v => v === 2).length);
  const tie = fromRows(['3322']);
  assert.equal(tint(tie).flat().filter(v => v === 2).length, 0);
  assert.equal(tint(tie).flat().filter(v => v === 3).length, 2);
  assert.deepEqual(tint(empty()), empty());
});

test('gravity compacts every column downward keeping order', () => {
  const board = empty();
  board[2][0] = 1; board[5][0] = 2; board[9][3] = 4;
  const out = gravity(deepFreeze(board));
  assert.equal(out[ROWS - 1][0], 2);
  assert.equal(out[ROWS - 2][0], 1);
  assert.equal(out[ROWS - 1][3], 4);
  assert.equal(filled(out), 3);
  assert.equal(out[2][0], 0);
});

test('settleFloating drops a floating cluster until supported', () => {
  const board = empty();
  board[ROWS - 1][0] = 1;
  board[10][5] = 2; board[11][5] = 2; board[11][6] = 2;
  const out = settleFloating(deepFreeze(board));
  assert.equal(out[ROWS - 1][5], 2);
  assert.equal(out[ROWS - 2][5], 2);
  assert.equal(out[ROWS - 1][6], 2);
  assert.equal(out[ROWS - 1][0], 1);
  assert.equal(filled(out), 4);
});

test('settleFloating keeps a connected group rigid (no per-column collapse)', () => {
  // An arch: two legs on the floor joined by a bridge stays put.
  const board = fromRows(['1.1', '111']);
  assert.deepEqual(settleFloating(board), board);
  // A cluster resting on another cluster that rests on the floor does not fall.
  const stacked = fromRows(['.2', '11', '1.']);
  assert.deepEqual(settleFloating(stacked), stacked);
});

test('settleFloating drops the upper cluster onto a lower one it is not connected to', () => {
  const board = empty();
  board[ROWS - 1][0] = 1;
  board[ROWS - 1][1] = 1;
  board[5][0] = 3; // loose block above the pair
  board[5][1] = 3;
  const out = settleFloating(board);
  assert.equal(out[ROWS - 2][0], 3);
  assert.equal(out[ROWS - 2][1], 3);
  assert.equal(filled(out), 4);
});

test('settleFloating treats diagonal contact as unconnected', () => {
  const board = empty();
  board[ROWS - 1][0] = 1;
  board[ROWS - 2][1] = 2; // diagonal to the floor block: floats
  const out = settleFloating(board);
  assert.equal(out[ROWS - 1][1], 2);
});

test('applyPowerup: settles after bomb/lightning/tint, per-column after gravity, nothing for freeze', () => {
  const board = empty();
  board[ROWS - 1][4] = 1; board[ROWS - 2][4] = 2; board[ROWS - 3][4] = 3;
  const bombed = applyPowerup('bomb', board, ROWS - 2, 4);
  assert.equal(filled(bombed), 0);
  const base = empty();
  base[ROWS - 1][0] = 1; base[ROWS - 2][0] = 4; base[ROWS - 3][0] = 4;
  const light = applyPowerup('lightning', base, ROWS - 1, 9);
  // The bottom row is wiped, so the two loose 4s settle onto the floor.
  assert.equal(filled(light), 2);
  assert.equal(light[ROWS - 1][0], 4);
  assert.equal(light[ROWS - 2][0], 4);
  const floating = empty();
  floating[3][2] = 5;
  assert.equal(applyPowerup('gravity', floating, 0, 0)[ROWS - 1][2], 5);
  assert.deepEqual(applyPowerup('freeze', floating, 0, 0), floating);
  assert.notEqual(applyPowerup('freeze', floating, 0, 0), floating);
});

test('pickPowerup covers every kind and only those', () => {
  const seen = new Set();
  for (let i = 0; i < POWERUP_KINDS.length; i++) seen.add(pickPowerup(() => i / POWERUP_KINDS.length));
  assert.deepEqual([...seen].sort(), [...POWERUP_KINDS].sort());
  assert.equal(pickPowerup(() => 0.9999), POWERUP_KINDS[POWERUP_KINDS.length - 1]);
});

test('rotatePowerupCell follows rotateCW and rotateCCW of a square matrix', () => {
  assert.deepEqual(rotatePowerupCell({ r: 0, c: 1 }, 3), { r: 1, c: 2 });
  assert.deepEqual(rotatePowerupCell({ r: 0, c: 1 }, 3, false), { r: 1, c: 0 });
  let cell = { r: 0, c: 2 };
  for (let i = 0; i < 4; i++) cell = rotatePowerupCell(cell, 4);
  assert.deepEqual(cell, { r: 0, c: 2 });
  assert.deepEqual(rotatePowerupCell(rotatePowerupCell({ r: 2, c: 0 }, 3), 3, false), { r: 2, c: 0 });
  // Consistent with the matrix rotation used by the game.
  const { rotateCW } = require('./pieces.js');
  const shape = [[0, 0, 0], [7, 7, 7], [0, 7, 0]];
  const rotated = rotateCW(shape);
  const moved = rotatePowerupCell({ r: 2, c: 1 }, 3);
  assert.equal(rotated[moved.r][moved.c], 7);
});

test('randomFilledCell only returns filled cells', () => {
  const shape = [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
  for (let i = 0; i < 10; i++) {
    const cell = randomFilledCell(shape, () => i / 10);
    assert.ok(shape[cell.r][cell.c]);
  }
  assert.equal(randomFilledCell([[0]], Math.random), null);
});

test('crossedInterval fires once per crossing, even for multiple multiples', () => {
  assert.equal(crossedInterval(8, 10), true);
  assert.equal(crossedInterval(10, 14), false);
  assert.equal(crossedInterval(9, 30), true);
  assert.equal(crossedInterval(0, 4), false);
  assert.equal(crossedInterval(19, 20, 10), true);
});

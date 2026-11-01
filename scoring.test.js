'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCORE_VALUES,
  createScoringState,
  isTSpin,
  isBoardEmpty,
  scoreClear,
} = require('./scoring.js');

const COLS = 10;
const ROWS = 20;

const emptyBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
const tPiece = (x, y) => ({ type: 3, shape: [[0, 3, 0], [3, 3, 3], [0, 0, 0]], x, y });
const clear = (state, cleared, extra = {}) =>
  scoreClear(state, { cleared, level: 1, tSpin: false, perfectClear: false, ...extra });

test('base score is unchanged for 1-4 lines at levels 1 and 3', () => {
  for (const level of [1, 3]) {
    for (let n = 1; n <= 4; n++) {
      const r = scoreClear(createScoringState(), { cleared: n, level, tSpin: false, perfectClear: false });
      assert.equal(r.points, SCORE_VALUES.LINES[n] * level);
      assert.deepEqual(r.achievements, []);
    }
  }
});

test('combo rises with consecutive clears and multiplies line points', () => {
  let r1 = clear(createScoringState(), 1);
  assert.equal(r1.state.combo, 1);
  assert.equal(r1.points, 100);
  const r2 = clear(r1.state, 1);
  assert.equal(r2.state.combo, 2);
  assert.equal(r2.points, 200);
  assert.deepEqual(r2.achievements, ['COMBO x2']);
  const r3 = clear(r2.state, 1);
  assert.equal(r3.state.combo, 3);
  assert.equal(r3.points, 300);
  assert.deepEqual(r3.achievements, ['COMBO x3']);
});

test('combo resets when a lock clears no lines', () => {
  const r1 = clear(clear(createScoringState(), 1).state, 1);
  const miss = clear(r1.state, 0);
  assert.equal(miss.points, 0);
  assert.equal(miss.state.combo, 0);
  assert.deepEqual(miss.achievements, []);
  assert.equal(clear(miss.state, 1).state.combo, 1);
});

test('isTSpin: true with 3 and 4 occupied corners', () => {
  const board = emptyBoard();
  // T at x=3,y=5 -> center (4,6); corners (3,5) (5,5) (3,7) (5,7)
  board[5][3] = 1;
  board[7][3] = 1;
  board[7][5] = 1;
  assert.equal(isTSpin(board, tPiece(3, 5), true), true);
  board[5][5] = 1;
  assert.equal(isTSpin(board, tPiece(3, 5), true), true);
});

test('isTSpin: walls and floor count as occupied corners', () => {
  const board = emptyBoard();
  // Left wall: corners x=-1 are out of bounds (2) + one board cell
  board[7][1] = 1; // center (0,6) -> corner (1,7)
  assert.equal(isTSpin(board, tPiece(-1, 5), true), true);
  // Floor: center row 18 -> corners at row 19 (in) and row 17; bottom corners
  // at row 19 are on the board, so use center row 19 -> bottom corners off board
  const b2 = emptyBoard();
  b2[18][3] = 1; // center (4,19) -> top-left corner (3,18)
  assert.equal(isTSpin(b2, tPiece(3, 18), true), true);
});

test('isTSpin: false with only 2 corners', () => {
  const board = emptyBoard();
  board[5][3] = 1;
  board[7][5] = 1;
  assert.equal(isTSpin(board, tPiece(3, 5), true), false);
});

test('isTSpin: false when the last move was not a rotation', () => {
  const board = emptyBoard();
  board[5][3] = 1;
  board[7][3] = 1;
  board[7][5] = 1;
  assert.equal(isTSpin(board, tPiece(3, 5), false), false);
});

test('isTSpin: false for non-T pieces', () => {
  const board = emptyBoard();
  board[5][3] = 1;
  board[7][3] = 1;
  board[7][5] = 1;
  const piece = { ...tPiece(3, 5), type: 6 };
  assert.equal(isTSpin(board, piece, true), false);
});

test('isTSpin: cells above the board are not occupied', () => {
  const board = emptyBoard();
  board[1][3] = 1;
  board[1][5] = 1;
  // center (4,0): top corners at row -1 are not occupied -> only 2
  assert.equal(isTSpin(board, tPiece(3, -1), true), false);
});

test('a T-spin that clears no lines gives no label or points', () => {
  const r = clear(createScoringState(), 0, { tSpin: true });
  assert.equal(r.points, 0);
  assert.deepEqual(r.achievements, []);
  assert.equal(r.state.backToBack, false);
});

test('T-spin bonus points', () => {
  const single = clear(createScoringState(), 1, { tSpin: true });
  assert.equal(single.points, 100 + 700);
  assert.deepEqual(single.achievements, ['T-SPIN']);
  assert.equal(clear(createScoringState(), 2, { tSpin: true }).points, 300 + 900);
  assert.equal(clear(createScoringState(), 3, { tSpin: true }).points, 500 + 1100);
  assert.equal(clear(createScoringState(), 1, { tSpin: true, level: 2 }).points, (100 + 700) * 2);
});

test('B2B: Tetris then Tetris applies the bonus', () => {
  const t1 = clear(createScoringState(), 4);
  assert.equal(t1.points, 800);
  assert.deepEqual(t1.achievements, []);
  const t2 = clear(t1.state, 4);
  assert.equal(t2.points, 800 * 2 + 400);
  assert.deepEqual(t2.achievements, ['B2B', 'COMBO x2']);
});

test('B2B: Tetris then T-spin applies the bonus', () => {
  const t1 = clear(createScoringState(), 4);
  const ts = clear(t1.state, 2, { tSpin: true });
  assert.equal(ts.points, (300 + 900) * 2 + 400);
  assert.deepEqual(ts.achievements, ['T-SPIN', 'B2B', 'COMBO x2']);
});

test('B2B: a common clear in between breaks the chain', () => {
  let s = clear(createScoringState(), 4).state;
  s = clear(s, 1).state;
  assert.equal(s.backToBack, false);
  const t = clear(s, 4);
  assert.ok(!t.achievements.includes('B2B'));
  assert.equal(t.points, 800 * 3);
});

test('B2B: a lock with no clear does not break the chain', () => {
  let s = clear(createScoringState(), 4).state;
  s = clear(s, 0).state;
  assert.equal(s.backToBack, true);
  const t = clear(s, 4);
  assert.deepEqual(t.achievements, ['B2B']);
  assert.equal(t.points, 800 + 400);
});

test('B2B: the first Tetris has no bonus', () => {
  const r = clear(createScoringState(), 4);
  assert.ok(!r.achievements.includes('B2B'));
  assert.equal(r.state.backToBack, true);
});

test('isBoardEmpty and Perfect Clear bonus', () => {
  const board = emptyBoard();
  assert.equal(isBoardEmpty(board), true);
  board[19][0] = 1;
  assert.equal(isBoardEmpty(board), false);
  const r = clear(createScoringState(), 1, { perfectClear: true });
  assert.equal(r.points, 100 + 2000);
  assert.deepEqual(r.achievements, ['PERFECT CLEAR']);
});

test('scoreClear does not mutate its input state', () => {
  const state = { combo: 2, backToBack: true };
  const snapshot = { ...state };
  const r = clear(state, 4);
  assert.deepEqual(state, snapshot);
  assert.notEqual(r.state, state);
});

test('points formula with everything combined', () => {
  const state = { combo: 1, backToBack: true };
  const r = scoreClear(state, { cleared: 3, level: 3, tSpin: true, perfectClear: true });
  // combo 2: ((500 + 1100) * 2 + 400 + 2000) * 3
  assert.equal(r.points, ((500 + 1100) * 2 + 400 + 2000) * 3);
  assert.deepEqual(r.achievements, ['T-SPIN', 'B2B', 'COMBO x2', 'PERFECT CLEAR']);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PLUS_TYPE, U_TYPE, Y_TYPE, SINGLE_TYPE, RING_TYPE,
  PIECE_SETTINGS, PIECES, rotateCW, rotateCCW, collides, spawnX, pickPieceType, previewOffset,
} = require('./pieces.js');

const COLS = 10;
const ROWS = 20;
const emptyBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
const count = shape => shape.flat().filter(Boolean).length;
const NEW_TYPES = [PLUS_TYPE, U_TYPE, Y_TYPE, SINGLE_TYPE, RING_TYPE];

// Deterministic rng that replays a list of values.
const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('new pieces have the expected size and block count', () => {
  const expected = {
    [PLUS_TYPE]: [3, 5], [U_TYPE]: [3, 5], [Y_TYPE]: [4, 5], [SINGLE_TYPE]: [1, 1], [RING_TYPE]: [3, 8],
  };
  for (const [type, [size, blocks]] of Object.entries(expected)) {
    const shape = PIECES[type];
    assert.equal(shape.length, size);
    assert.ok(shape.every(row => row.length === size), `type ${type} is square`);
    assert.equal(count(shape), blocks);
    assert.ok(shape.flat().every(v => v === 0 || v === Number(type)), `type ${type} uses its own colour`);
  }
  assert.equal(PIECES[RING_TYPE][1][1], 0, 'ring is hollow');
});

test('rotating four times returns the original matrix and keeps the block count', () => {
  for (const type of NEW_TYPES) {
    let shape = PIECES[type];
    for (let i = 0; i < 4; i++) {
      shape = rotateCW(shape);
      assert.equal(count(shape), count(PIECES[type]));
    }
    assert.deepEqual(shape, PIECES[type]);
  }
});

test('rotateCCW undoes rotateCW', () => {
  for (let type = 1; type < PIECES.length; type++) {
    assert.deepEqual(rotateCCW(rotateCW(PIECES[type])), PIECES[type]);
  }
  assert.deepEqual(rotateCCW([[1, 2], [3, 4]]), [[2, 4], [1, 3]]);
});

test('PLUS, SINGLE and RING are rotation invariant; U and Y are not', () => {
  for (const type of [PLUS_TYPE, SINGLE_TYPE, RING_TYPE]) {
    assert.deepEqual(rotateCW(PIECES[type]), PIECES[type]);
  }
  for (const type of [U_TYPE, Y_TYPE]) {
    assert.notDeepEqual(rotateCW(PIECES[type]), PIECES[type]);
  }
});

test('every piece fits inside the board at spawn in all four rotations', () => {
  const board = emptyBoard();
  for (let type = 1; type < PIECES.length; type++) {
    let shape = PIECES[type];
    for (let i = 0; i < 4; i++) {
      const x = spawnX(COLS, shape[0].length);
      assert.equal(collides(board, shape, x, 0), false, `type ${type} rotation ${i}`);
      shape = rotateCW(shape);
    }
  }
});

test('collision: walls, floor and locked blocks', () => {
  const board = emptyBoard();
  for (const type of NEW_TYPES) {
    const shape = PIECES[type];
    const w = shape[0].length;
    // Find the filled extents so the wall checks are exact for each shape.
    const cols = shape.flatMap(row => row.map((v, c) => (v ? c : -1))).filter(c => c >= 0);
    const rows = shape.flatMap((row, r) => (row.some(Boolean) ? [r] : []));
    assert.equal(collides(board, shape, -Math.min(...cols), 0), false);
    assert.equal(collides(board, shape, -Math.min(...cols) - 1, 0), true, `${type} left wall`);
    assert.equal(collides(board, shape, COLS - 1 - Math.max(...cols), 0), false);
    assert.equal(collides(board, shape, COLS - Math.max(...cols), 0), true, `${type} right wall`);
    assert.equal(collides(board, shape, 3, ROWS - 1 - Math.max(...rows)), false);
    assert.equal(collides(board, shape, 3, ROWS - Math.max(...rows)), true, `${type} floor`);

    const x = spawnX(COLS, w);
    const filled = shape.flatMap((row, r) => row.map((v, c) => (v ? [r, c] : null))).filter(Boolean);
    const [r0, c0] = filled[0];
    const blocked = emptyBoard();
    blocked[5 + r0][x + c0] = 1;
    assert.equal(collides(blocked, shape, x, 5), true, `${type} overlap`);
  }
});

test('the RING hole accepts a block that a solid 3x3 would not', () => {
  const board = emptyBoard();
  board[6][4] = 1; // exactly the ring centre when placed at (3, 5)
  assert.equal(collides(board, PIECES[RING_TYPE], 3, 5), false);
  assert.equal(collides(board, PIECES[PLUS_TYPE], 3, 5), true);
});

test('spawnX centres every piece within the board', () => {
  assert.equal(spawnX(COLS, 4), 3);
  assert.equal(spawnX(COLS, 3), 4);
  assert.equal(spawnX(COLS, 2), 4);
  assert.equal(spawnX(COLS, 1), 5);
});

test('pickPieceType returns only classic pieces, uniformly, when disabled', () => {
  const off = { ...PIECE_SETTINGS, NON_STANDARD_ENABLED: false };
  const seen = new Set();
  for (let i = 0; i < 700; i++) {
    const type = pickPieceType(() => (i % 7) / 7 + 0.001, off);
    assert.ok(type >= 1 && type <= 7);
    seen.add(type);
  }
  assert.equal(seen.size, 7);
  assert.equal(pickPieceType(() => 0, off), 1);
  assert.equal(pickPieceType(() => 0.999, off), 7);
});

test('pickPieceType maps the roll to RING, a pentomino or a classic piece', () => {
  const on = { ...PIECE_SETTINGS, NON_STANDARD_ENABLED: true };
  assert.equal(pickPieceType(seq([0.0]), on), RING_TYPE);
  assert.equal(pickPieceType(seq([on.RING_CHANCE - 0.001]), on), RING_TYPE);
  assert.equal(pickPieceType(seq([on.RING_CHANCE, 0.0]), on), PLUS_TYPE);
  assert.equal(pickPieceType(seq([on.RING_CHANCE, 0.5]), on), U_TYPE);
  assert.equal(pickPieceType(seq([on.RING_CHANCE, 0.99]), on), Y_TYPE);
  assert.equal(pickPieceType(seq([0.5, 0.0]), on), 1);
  assert.equal(pickPieceType(seq([0.999, 0.999]), on), 7);
});

test('SINGLE never spawns randomly and probabilities are roughly respected', () => {
  let state = 12345;
  const rng = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const tally = {};
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const type = pickPieceType(rng, PIECE_SETTINGS);
    tally[type] = (tally[type] || 0) + 1;
  }
  assert.equal(tally[SINGLE_TYPE], undefined);
  assert.ok(Math.abs(tally[RING_TYPE] / N - PIECE_SETTINGS.RING_CHANCE) < 0.01);
  const pentominoes = (tally[PLUS_TYPE] + tally[U_TYPE] + tally[Y_TYPE]) / N;
  assert.ok(Math.abs(pentominoes - PIECE_SETTINGS.PENTOMINO_CHANCE) < 0.01);
});

test('previewOffset keeps every piece and rotation inside a 4x4 box, centred', () => {
  for (let type = 1; type < PIECES.length; type++) {
    let shape = PIECES[type];
    for (let i = 0; i < 4; i++) {
      const { x, y } = previewOffset(shape, 4);
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          assert.ok(x + c >= 0 && x + c + 1 <= 4, `type ${type} x`);
          assert.ok(y + r >= 0 && y + r + 1 <= 4, `type ${type} y`);
        }
      }
      shape = rotateCW(shape);
    }
  }
  assert.deepEqual(previewOffset(PIECES[SINGLE_TYPE], 4), { x: 1.5, y: 1.5 });
  assert.deepEqual(previewOffset(PIECES[RING_TYPE], 4), { x: 0.5, y: 0.5 });
});

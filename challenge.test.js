'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS } = require('./levels.js');
const {
  FIXED_BLOCK, countFixed, buildPresetBoard, createProgress, evaluate, formatTime,
  objectiveText, progressText, addGarbageRow, validateLevel,
} = require('./challenge.js');

const ROWS = 20;
const COLS = 10;
const byId = id => LEVELS.find(l => l.id === id);
const state = (extra = {}) => ({ lines: 0, elapsedMs: 0, fixedRemaining: 0, toppedOut: false, ...extra });
const emptyBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

test('every shipped level is a well formed entry', () => {
  assert.equal(new Set(LEVELS.map(l => l.id)).size, LEVELS.length);
  for (const level of LEVELS) assert.deepEqual(validateLevel(level), [], level.id);
  assert.deepEqual(LEVELS.map(l => l.id), ['sprint', 'garbage', 'preset', 'invisible', 'reverse']);
});

test('sprint: 40 lines wins, time out loses, top out loses', () => {
  const level = byId('sprint');
  assert.equal(level.rules.timeLimitMs, 120000);
  assert.equal(evaluate(level, state({ lines: 39, elapsedMs: 119999 })), 'playing');
  assert.equal(evaluate(level, state({ lines: 40, elapsedMs: 60000 })), 'won');
  assert.equal(evaluate(level, state({ lines: 40, elapsedMs: 120000 })), 'won', 'reaching the target wins ties');
  assert.equal(evaluate(level, state({ lines: 39, elapsedMs: 120000 })), 'lost');
  assert.equal(evaluate(level, state({ lines: 10, elapsedMs: 5, toppedOut: true })), 'lost');
});

test('garbage: surviving the time wins, top out loses, no time-out defeat', () => {
  const level = byId('garbage');
  assert.equal(level.rules.garbageIntervalMs, 10000);
  assert.equal(level.defeat.timeOut, false);
  assert.equal(evaluate(level, state({ elapsedMs: 119999 })), 'playing');
  assert.equal(evaluate(level, state({ elapsedMs: 120000 })), 'won');
  assert.equal(evaluate(level, state({ elapsedMs: 30000, toppedOut: true })), 'lost');
  assert.equal(evaluate(level, state({ elapsedMs: 130000, toppedOut: true })), 'lost');
});

test('preset: no complete row, win when no fixed cells remain, top out loses, no time limit', () => {
  const level = byId('preset');
  assert.equal(level.rules.timeLimitMs, undefined);
  assert.ok(level.rules.presetRows.every(row => row.length === COLS && row.includes('.')));
  const board = buildPresetBoard(level, ROWS, COLS);
  assert.equal(countFixed(board), level.rules.presetRows.join('').split('#').length - 1);
  assert.ok(board.every(row => !row.every(v => v !== 0)), 'no complete row');
  assert.equal(createProgress(level).fixedRemaining, countFixed(board));
  assert.equal(evaluate(level, state({ fixedRemaining: 5, elapsedMs: 9999999 })), 'playing');
  assert.equal(evaluate(level, state({ fixedRemaining: 0 })), 'won');
  assert.equal(evaluate(level, state({ fixedRemaining: 5, toppedOut: true })), 'lost');
});

test('preset rows stack at the bottom with the last string as the bottom row', () => {
  const level = { rules: { presetRows: ['#.........', '.........#'] } };
  const board = buildPresetBoard(level, ROWS, COLS);
  assert.equal(board[ROWS - 2][0], FIXED_BLOCK);
  assert.equal(board[ROWS - 1][9], FIXED_BLOCK);
  assert.equal(countFixed(board), 2);
  assert.equal(board[0].every(v => v === 0), true);
});

test('invisible and reverse: lines win, top out loses', () => {
  const invisible = byId('invisible');
  assert.equal(invisible.rules.invisibleLocked, true);
  assert.equal(evaluate(invisible, state({ lines: 19 })), 'playing');
  assert.equal(evaluate(invisible, state({ lines: 20 })), 'won');
  assert.equal(evaluate(invisible, state({ lines: 5, toppedOut: true })), 'lost');
  const reverse = byId('reverse');
  assert.equal(reverse.rules.invertRotation, true);
  assert.equal(evaluate(reverse, state({ lines: 29, elapsedMs: 9999999 })), 'playing');
  assert.equal(evaluate(reverse, state({ lines: 30 })), 'won');
  assert.equal(evaluate(reverse, state({ lines: 29, toppedOut: true })), 'lost');
});

test('HUD text: objective and progress for each type', () => {
  assert.equal(objectiveText(byId('sprint')), 'CLEAR 40 LINES');
  assert.equal(objectiveText(byId('garbage')), 'SURVIVE 2:00');
  assert.equal(objectiveText(byId('preset')), 'CLEAR ALL FIXED BLOCKS');
  assert.deepEqual(progressText(byId('sprint'), state({ lines: 12, elapsedMs: 35000 })), ['LINES 12/40', 'TIME 1:25']);
  assert.deepEqual(progressText(byId('garbage'), state({ elapsedMs: 60000 })), ['TIME 1:00']);
  assert.deepEqual(progressText(byId('preset'), state({ fixedRemaining: 14 })), ['FIXED 14']);
  assert.deepEqual(progressText(byId('invisible'), state({ lines: 3 })), ['LINES 3/20']);
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(61000), '1:01');
});

test('addGarbageRow adds a bottom row with one hole and shifts the board up', () => {
  const board = emptyBoard();
  board[19][2] = 1;
  const frozen = board.map(r => Object.freeze([...r]));
  const { board: next, overflowed } = addGarbageRow(frozen, 4);
  assert.equal(overflowed, false);
  assert.equal(next.length, ROWS);
  assert.deepEqual(next[19], [13, 13, 13, 13, 0, 13, 13, 13, 13, 13]);
  assert.equal(next[18][2], 1);
  assert.equal(next[19].filter(v => v === 0).length, 1);
  assert.equal(frozen[19][2], 1, 'input untouched');
});

test('addGarbageRow reports overflow when the top row was occupied', () => {
  const board = emptyBoard();
  board[0][3] = 5;
  assert.equal(addGarbageRow(board, 0).overflowed, true);
  assert.equal(addGarbageRow(emptyBoard(), 0).overflowed, false);
});

test('a dynamic entry works with no code changes (evaluate, HUD, validation)', () => {
  const levels = [...LEVELS, {
    id: 'mini',
    name: 'Mini',
    description: 'Limpia 2 líneas en 10 s.',
    objective: { type: 'lines', target: 2 },
    rules: { timeLimitMs: 10000 },
    defeat: { timeOut: true, topOut: true },
  }];
  const mini = levels.find(l => l.id === 'mini');
  assert.deepEqual(validateLevel(mini), []);
  assert.equal(evaluate(mini, state({ lines: 2, elapsedMs: 3000 })), 'won');
  assert.equal(evaluate(mini, state({ lines: 1, elapsedMs: 10000 })), 'lost');
  assert.equal(evaluate(mini, state({ lines: 1, elapsedMs: 9999 })), 'playing');
  assert.equal(objectiveText(mini), 'CLEAR 2 LINES');
  assert.equal(levels.length, LEVELS.length + 1);
});

test('validateLevel flags malformed entries', () => {
  const good = byId('sprint');
  assert.ok(validateLevel({ ...good, id: '' }).includes('id'));
  assert.ok(validateLevel({ ...good, objective: { type: 'nope' } }).includes('objective.type'));
  assert.ok(validateLevel({ ...good, objective: { type: 'lines' } }).includes('objective.target'));
  assert.ok(validateLevel({ ...good, defeat: { timeOut: true, topOut: false } }).includes('defeat'));
  assert.ok(validateLevel({ ...byId('preset'), rules: { presetRows: ['##########'] } }).includes('presetRows complete row'));
  assert.ok(validateLevel({ ...byId('preset'), rules: {} }).includes('presetRows'));
  assert.ok(validateLevel(null).length > 0);
});

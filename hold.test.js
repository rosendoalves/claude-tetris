'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHoldState, useHold, unlockHold } = require('./hold.js');

test('a new state is empty and unlocked', () => {
  assert.deepEqual(createHoldState(), { type: null, locked: false });
});

test('holding with an empty slot stores the piece, locks, and requests no swap', () => {
  const result = useHold(createHoldState(), 3);
  assert.deepEqual(result.state, { type: 3, locked: true });
  assert.equal(result.swapType, null);
  assert.equal(result.used, true);
});

test('holding with an occupied slot returns the previous type', () => {
  const result = useHold({ type: 5, locked: false }, 2);
  assert.deepEqual(result.state, { type: 2, locked: true });
  assert.equal(result.swapType, 5);
  assert.equal(result.used, true);
});

test('a second use while locked does nothing', () => {
  const locked = useHold({ type: 5, locked: false }, 2).state;
  const result = useHold(locked, 7);
  assert.deepEqual(result.state, { type: 2, locked: true });
  assert.equal(result.swapType, null);
  assert.equal(result.used, false);
});

test('unlocking re-enables holding and keeps the stored type', () => {
  const locked = useHold(createHoldState(), 4).state;
  const unlocked = unlockHold(locked);
  assert.deepEqual(unlocked, { type: 4, locked: false });
  assert.equal(useHold(unlocked, 6).used, true);
});

test('inputs are never mutated', () => {
  const state = Object.freeze({ type: 1, locked: false });
  const locked = Object.freeze({ type: 1, locked: true });
  useHold(state, 2);
  useHold(locked, 2);
  unlockHold(locked);
  assert.deepEqual(state, { type: 1, locked: false });
  assert.deepEqual(locked, { type: 1, locked: true });
});

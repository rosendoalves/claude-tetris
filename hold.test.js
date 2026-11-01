'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHoldState, useHold, unlockHold } = require('./hold.js');

test('a new state is empty and unlocked', () => {
  assert.deepEqual(createHoldState(), { type: null, locked: false, powerup: null });
});

test('holding with an empty slot stores the piece, locks, and requests no swap', () => {
  const result = useHold(createHoldState(), 3);
  assert.deepEqual(result.state, { type: 3, locked: true, powerup: null });
  assert.equal(result.swapType, null);
  assert.equal(result.used, true);
});

test('holding with an occupied slot returns the previous type', () => {
  const result = useHold({ type: 5, locked: false, powerup: null }, 2);
  assert.deepEqual(result.state, { type: 2, locked: true, powerup: null });
  assert.equal(result.swapType, 5);
  assert.equal(result.used, true);
});

test('a second use while locked does nothing', () => {
  const locked = useHold({ type: 5, locked: false, powerup: null }, 2).state;
  const result = useHold(locked, 7);
  assert.deepEqual(result.state, { type: 2, locked: true, powerup: null });
  assert.equal(result.swapType, null);
  assert.equal(result.used, false);
});

test('unlocking re-enables holding and keeps the stored type', () => {
  const locked = useHold(createHoldState(), 4).state;
  const unlocked = unlockHold(locked);
  assert.deepEqual(unlocked, { type: 4, locked: false, powerup: null });
  assert.equal(useHold(unlocked, 6).used, true);
});

test('inputs are never mutated', () => {
  const state = Object.freeze({ type: 1, locked: false, powerup: null });
  const locked = Object.freeze({ type: 1, locked: true, powerup: null });
  useHold(state, 2);
  useHold(locked, 2);
  unlockHold(locked);
  assert.deepEqual(state, { type: 1, locked: false, powerup: null });
  assert.deepEqual(locked, { type: 1, locked: true, powerup: null });
});

test('a power-up kind is stored with the held piece and returned on swap', () => {
  const stored = useHold(createHoldState(), 3, 'bomb');
  assert.deepEqual(stored.state, { type: 3, locked: true, powerup: 'bomb' });
  assert.equal(stored.swapPowerup, null);
  const swapped = useHold(unlockHold(stored.state), 5, 'tint');
  assert.equal(swapped.swapType, 3);
  assert.equal(swapped.swapPowerup, 'bomb');
  assert.deepEqual(swapped.state, { type: 5, locked: true, powerup: 'tint' });
});

test('swapping with a plain held piece returns no power-up', () => {
  const swapped = useHold({ type: 4, locked: false, powerup: null }, 2, 'freeze');
  assert.equal(swapped.swapPowerup, null);
  assert.equal(swapped.state.powerup, 'freeze');
});

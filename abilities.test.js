'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ABILITY_SETTINGS, MAX_TIMER_TICK_MS, ABILITIES, createTimers, addEnergy, canOpenMenu,
  canUndo, isAbilityAvailable, tickTimers, effectiveDropInterval,
} = require('./abilities.js');

test('settings match the documented values', () => {
  assert.deepEqual(ABILITY_SETTINGS, {
    ENERGY_REQUIRED: 100,
    ENERGY_PER_LINES: [0, 10, 25, 45, 70],
    VISION_MS: 20000,
    SLOW_MS: 10000,
    VISION_COUNT: 5,
  });
  assert.deepEqual(ABILITIES.map(a => a.id), [1, 2, 3, 4, 5]);
});

test('addEnergy uses the per-lines table and clamps to the maximum', () => {
  assert.equal(addEnergy(0, 0), 0);
  assert.equal(addEnergy(0, 1), 10);
  assert.equal(addEnergy(0, 2), 25);
  assert.equal(addEnergy(0, 3), 45);
  assert.equal(addEnergy(0, 4), 70);
  assert.equal(addEnergy(50, 4), 100);
  assert.equal(addEnergy(100, 4), 100);
  assert.equal(addEnergy(95, 1), 100);
  assert.equal(addEnergy(20, 9), 90); // more than 4 lines uses the largest entry
  assert.equal(addEnergy(20, -1), 20);
});

test('the menu opens only with a full bar', () => {
  assert.equal(canOpenMenu(0), false);
  assert.equal(canOpenMenu(99), false);
  assert.equal(canOpenMenu(100), true);
});

test('vision and slow are always available', () => {
  assert.equal(isAbilityAvailable(1, {}), true);
  assert.equal(isAbilityAvailable(3, {}), true);
});

test('swap needs a candidate that fits', () => {
  assert.equal(isAbilityAvailable(2, { swapPossible: true }), true);
  assert.equal(isAbilityAvailable(2, { swapPossible: false }), false);
});

test('extra hold needs a locked hold', () => {
  assert.equal(isAbilityAvailable(5, { holdLocked: true }), true);
  assert.equal(isAbilityAvailable(5, { holdLocked: false }), false);
});

test('undo is refused without a snapshot, after a clear, after a power-up, or if the respawn collides', () => {
  const good = { cleared: false, firedPowerup: false };
  assert.equal(canUndo(good, true), true);
  assert.equal(canUndo(null, true), false);
  assert.equal(canUndo({ ...good, cleared: true }, true), false);
  assert.equal(canUndo({ ...good, firedPowerup: true }, true), false);
  assert.equal(canUndo(good, false), false);
  assert.equal(isAbilityAvailable(4, { snapshot: good, respawnFits: true }), true);
  assert.equal(isAbilityAvailable(4, { snapshot: null, respawnFits: true }), false);
});

test('unknown ability ids are unavailable', () => {
  assert.equal(isAbilityAvailable(6, { holdLocked: true }), false);
});

test('timers tick down with dt and never go negative', () => {
  const t = tickTimers({ visionMs: 100, slowMs: 50 }, 80);
  assert.deepEqual(t, { visionMs: 20, slowMs: 0 });
  assert.deepEqual(tickTimers(createTimers(), 16), createTimers());
});

test('a huge dt consumes at most one tick (resume cannot expire timers)', () => {
  const t = tickTimers({ visionMs: ABILITY_SETTINGS.VISION_MS, slowMs: ABILITY_SETTINGS.SLOW_MS }, 600000);
  assert.equal(t.visionMs, ABILITY_SETTINGS.VISION_MS - MAX_TIMER_TICK_MS);
  assert.equal(t.slowMs, ABILITY_SETTINGS.SLOW_MS - MAX_TIMER_TICK_MS);
});

test('timers expire after the configured duration of normal frames', () => {
  let t = { visionMs: ABILITY_SETTINGS.VISION_MS, slowMs: ABILITY_SETTINGS.SLOW_MS };
  let elapsed = 0;
  while (t.slowMs > 0) { t = tickTimers(t, 16); elapsed += 16; }
  assert.ok(elapsed >= 10000 && elapsed < 10016);
  assert.ok(t.visionMs > 0);
});

test('tickTimers does not mutate its input', () => {
  const input = Object.freeze({ visionMs: 1000, slowMs: 1000 });
  tickTimers(input, 16);
  assert.deepEqual(input, { visionMs: 1000, slowMs: 1000 });
});

test('slow doubles the effective interval without changing the base', () => {
  assert.equal(effectiveDropInterval(800, 5000), 1600);
  assert.equal(effectiveDropInterval(800, 0), 800);
});

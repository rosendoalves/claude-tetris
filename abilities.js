'use strict';

// Pure ability logic (no DOM): energy, menu gating, availability and timers.
const ABILITY_SETTINGS = {
  ENERGY_REQUIRED: 100,
  ENERGY_PER_LINES: [0, 10, 25, 45, 70], // energy gained by clearing 0-4 lines
  VISION_MS: 20000,
  SLOW_MS: 10000,
  VISION_COUNT: 5,
};

// Largest dt (ms) a timer may consume per frame. A huge jump (hidden tab,
// resume after a long pause) therefore never expires an ability by itself.
const MAX_TIMER_TICK_MS = 250;

// Menu order = key order (1-5).
const ABILITIES = [
  { id: 1, key: 'vision', name: 'Visión' },
  { id: 2, key: 'swap', name: 'Intercambio' },
  { id: 3, key: 'slow', name: 'Ralentizar' },
  { id: 4, key: 'undo', name: 'Deshacer' },
  { id: 5, key: 'extraHold', name: 'Hold extra' },
];

function createTimers() {
  return { visionMs: 0, slowMs: 0 };
}

// Energy after clearing `cleared` lines, clamped to [0, ENERGY_REQUIRED].
function addEnergy(energy, cleared, settings = ABILITY_SETTINGS) {
  const table = settings.ENERGY_PER_LINES;
  const gain = table[Math.min(Math.max(cleared, 0), table.length - 1)] || 0;
  return Math.min(settings.ENERGY_REQUIRED, Math.max(0, energy + gain));
}

// The menu opens only with a full bar.
function canOpenMenu(energy, settings = ABILITY_SETTINGS) {
  return energy >= settings.ENERGY_REQUIRED;
}

// Undo needs a snapshot of the last lock that cleared nothing, fired no
// power-up, and whose piece fits again at the standard spawn position.
function canUndo(snapshot, respawnFits) {
  return Boolean(snapshot) && !snapshot.cleared && !snapshot.firedPowerup && Boolean(respawnFits);
}

// ctx: { holdLocked, swapPossible, snapshot, respawnFits }
function isAbilityAvailable(id, ctx) {
  switch (id) {
    case 1: return true;
    case 2: return Boolean(ctx.swapPossible);
    case 3: return true;
    case 4: return canUndo(ctx.snapshot, ctx.respawnFits);
    case 5: return Boolean(ctx.holdLocked);
    default: return false;
  }
}

// Advances the vision/slow timers by dt (clamped). Never mutates `timers`.
function tickTimers(timers, dt) {
  const step = Math.min(Math.max(dt, 0), MAX_TIMER_TICK_MS);
  return {
    visionMs: Math.max(0, timers.visionMs - step),
    slowMs: Math.max(0, timers.slowMs - step),
  };
}

// Gravity interval with Ralentizar applied; the base interval is not changed.
function effectiveDropInterval(dropInterval, slowMs) {
  return slowMs > 0 ? dropInterval * 2 : dropInterval;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ABILITY_SETTINGS,
    MAX_TIMER_TICK_MS,
    ABILITIES,
    createTimers,
    addEnergy,
    canOpenMenu,
    canUndo,
    isAbilityAvailable,
    tickTimers,
    effectiveDropInterval,
  };
}

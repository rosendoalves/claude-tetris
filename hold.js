'use strict';

// Pure hold logic (no DOM). A held piece is stored by type only, so it
// always re-enters play with the standard spawn rotation and position. A
// power-up carried by the piece is stored by kind and reapplied by the caller.
function createHoldState() {
  return { type: null, locked: false, powerup: null };
}

// Tries to hold the active piece. Never mutates `state`.
// - locked: nothing happens (one hold per piece).
// - empty slot: stores the piece; the caller spawns the next one (swapType null).
// - occupied slot: stores the piece; the caller plays swapType (and swapPowerup).
function useHold(state, activeType, activePowerup = null) {
  if (state.locked) {
    return { state: { ...state }, swapType: null, swapPowerup: null, used: false };
  }
  return {
    state: { type: activeType, locked: true, powerup: activePowerup },
    swapType: state.type,
    swapPowerup: state.type === null ? null : state.powerup ?? null,
    used: true,
  };
}

// Re-enables holding; called when the active piece locks onto the board.
function unlockHold(state) {
  return { ...state, locked: false };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createHoldState,
    useHold,
    unlockHold,
  };
}

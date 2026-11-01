'use strict';

// Pure hold logic (no DOM). A held piece is stored by type only, so it
// always re-enters play with the standard spawn rotation and position.
function createHoldState() {
  return { type: null, locked: false };
}

// Tries to hold the active piece. Never mutates `state`.
// - locked: nothing happens (one hold per piece).
// - empty slot: stores the piece; the caller spawns the next one (swapType null).
// - occupied slot: stores the piece; the caller plays swapType.
function useHold(state, activeType) {
  if (state.locked) {
    return { state: { ...state }, swapType: null, used: false };
  }
  return {
    state: { type: activeType, locked: true },
    swapType: state.type,
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

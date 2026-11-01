'use strict';

// Pure scoring logic (no DOM). Every point value lives in SCORE_VALUES.
const SCORE_VALUES = {
  LINES: [0, 100, 300, 500, 800],
  T_SPIN_BONUS: [0, 700, 900, 1100],
  B2B_BONUS: 400,
  PERFECT_CLEAR_BONUS: 2000,
};

const T_PIECE_TYPE = 3;

function createScoringState() {
  return { combo: 0, backToBack: false };
}

// 3-corner T-spin: the piece is a T, its last move was a rotation, and at
// least 3 of the 4 diagonal corners around the T center are occupied.
// Walls and floor count as occupied; cells above the board do not.
function isTSpin(board, piece, lastMoveWasRotation) {
  if (piece.type !== T_PIECE_TYPE || !lastMoveWasRotation) return false;
  const rows = board.length;
  const cols = board[0].length;
  const cx = piece.x + 1;
  const cy = piece.y + 1;
  let occupied = 0;
  for (const dy of [-1, 1]) {
    for (const dx of [-1, 1]) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= cols || y >= rows) occupied++;
      else if (y >= 0 && board[y][x] !== 0) occupied++;
    }
  }
  return occupied >= 3;
}

function isBoardEmpty(board) {
  return board.every(row => row.every(cell => cell === 0));
}

function scoreClear(state, { cleared, level, tSpin, perfectClear }) {
  if (cleared === 0) {
    return {
      points: 0,
      state: { combo: 0, backToBack: state.backToBack },
      achievements: [],
    };
  }
  const combo = state.combo + 1;
  const difficult = cleared === 4 || tSpin;
  const b2b = difficult && state.backToBack;
  const tSpinBonus = tSpin ? (SCORE_VALUES.T_SPIN_BONUS[cleared] || 0) : 0;
  const line = SCORE_VALUES.LINES[cleared] || 0;
  const points =
    ((line + tSpinBonus) * combo +
      (b2b ? SCORE_VALUES.B2B_BONUS : 0) +
      (perfectClear ? SCORE_VALUES.PERFECT_CLEAR_BONUS : 0)) * level;

  const achievements = [];
  if (tSpin) achievements.push('T-SPIN');
  if (b2b) achievements.push('B2B');
  if (combo >= 2) achievements.push(`COMBO x${combo}`);
  if (perfectClear) achievements.push('PERFECT CLEAR');

  return { points, state: { combo, backToBack: difficult }, achievements };
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCORE_VALUES,
    T_PIECE_TYPE,
    createScoringState,
    isTSpin,
    isBoardEmpty,
    scoreClear,
  };
}

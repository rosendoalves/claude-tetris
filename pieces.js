'use strict';

// Pure piece data and selection logic (no DOM). Piece types double as board
// colour indices: 1-7 are the classic tetrominoes, 8-12 the non-standard ones.
const CLASSIC_COUNT = 7;
const PLUS_TYPE = 8;
const U_TYPE = 9;
const Y_TYPE = 10;
const SINGLE_TYPE = 11;
const RING_TYPE = 12;
const PENTOMINO_TYPES = [PLUS_TYPE, U_TYPE, Y_TYPE];

// Single place for spawn probabilities and the on/off toggle.
// SINGLE never spawns randomly: it is only the reward for a Tetris.
const PIECE_SETTINGS = {
  NON_STANDARD_ENABLED: true,
  PENTOMINO_CHANCE: 0.06, // chance of a PLUS, U or Y (one third each)
  RING_CHANCE: 0.03,
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // PLUS
  [[9,0,9],[9,9,9],[0,0,0]],                  // U
  [[0,0,0,0],[10,10,10,10],[0,10,0,0],[0,0,0,0]], // Y
  [[11]],                                      // SINGLE
  [[12,12,12],[12,0,12],[12,12,12]],          // RING (hollow, 8 blocks)
];

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

// True when `shape` placed at (ox, oy) leaves the board or overlaps a block.
// Cells above the top edge (ny < 0) are allowed.
function collides(board, shape, ox, oy) {
  const rows = board.length, cols = board[0].length;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= cols || ny >= rows) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

// Horizontal spawn column: centred on the board's middle column.
function spawnX(cols, width) {
  return Math.floor(cols / 2) - Math.floor(width / 2);
}

// Picks a piece type. `rng` returns a number in [0, 1).
// Disabled: uniform over the 7 classic pieces. Enabled: a single draw selects
// RING, then a pentomino, otherwise a classic piece.
function pickPieceType(rng, settings = PIECE_SETTINGS) {
  const classic = () => Math.floor(rng() * CLASSIC_COUNT) + 1;
  if (!settings.NON_STANDARD_ENABLED) return classic();
  const roll = rng();
  if (roll < settings.RING_CHANCE) return RING_TYPE;
  if (roll < settings.RING_CHANCE + settings.PENTOMINO_CHANCE) {
    return PENTOMINO_TYPES[Math.floor(rng() * PENTOMINO_TYPES.length)];
  }
  return classic();
}

// Offset (in cells, possibly fractional) that centres the filled cells of
// `shape` inside a `cells` x `cells` preview box.
function previewOffset(shape, cells = 4) {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
  }
  if (maxR < 0) return { x: 0, y: 0 };
  return {
    x: (cells - (maxC - minC + 1)) / 2 - minC,
    y: (cells - (maxR - minR + 1)) / 2 - minR,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CLASSIC_COUNT,
    PLUS_TYPE,
    U_TYPE,
    Y_TYPE,
    SINGLE_TYPE,
    RING_TYPE,
    PENTOMINO_TYPES,
    PIECE_SETTINGS,
    PIECES,
    rotateCW,
    collides,
    spawnX,
    pickPieceType,
    previewOffset,
  };
}

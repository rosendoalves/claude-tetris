'use strict';

// Pure challenge logic (no DOM): progress, win/lose evaluation, HUD text and
// board helpers. Levels are plain data (see levels.js).

// Board value for fixed blocks (and garbage rows); drawn in gray.
const FIXED_BLOCK = 13;
const OBJECTIVE_TYPES = ['lines', 'survive', 'clearFixed'];

function countFixed(board) {
  return board.reduce((total, row) => total + row.filter(v => v === FIXED_BLOCK).length, 0);
}

// Builds a board of `rows` x `cols`, with the level's presetRows stacked at the bottom.
function buildPresetBoard(level, rows, cols) {
  const board = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const preset = (level.rules && level.rules.presetRows) || [];
  preset.forEach((line, i) => {
    const r = rows - preset.length + i;
    for (let c = 0; c < cols; c++) if (line[c] === '#') board[r][c] = FIXED_BLOCK;
  });
  return board;
}

function createProgress(level, rows = 20, cols = 10) {
  return {
    lines: 0,
    elapsedMs: 0,
    fixedRemaining: countFixed(buildPresetBoard(level, rows, cols)),
    toppedOut: false,
  };
}

// 'playing' | 'won' | 'lost'. Topping out always loses.
function evaluate(level, { lines, elapsedMs, fixedRemaining, toppedOut }) {
  if (toppedOut && level.defeat.topOut) return 'lost';
  const { objective, rules, defeat } = level;
  const limit = rules.timeLimitMs;
  if (objective.type === 'lines' && lines >= objective.target) return 'won';
  if (objective.type === 'clearFixed' && fixedRemaining === 0) return 'won';
  if (objective.type === 'survive' && elapsedMs >= (objective.target ?? limit)) return 'won';
  if (objective.type !== 'survive' && defeat.timeOut && limit !== undefined && elapsedMs >= limit) return 'lost';
  return 'playing';
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function objectiveText(level) {
  const { objective } = level;
  if (objective.type === 'lines') return `CLEAR ${objective.target} LINES`;
  if (objective.type === 'survive') return `SURVIVE ${formatTime(objective.target)}`;
  if (objective.type === 'clearFixed') return 'CLEAR ALL FIXED BLOCKS';
  return '';
}

// One short string per HUD line: lines, time remaining, fixed blocks remaining.
function progressText(level, progress) {
  const { objective, rules } = level;
  const parts = [];
  if (objective.type === 'lines') parts.push(`LINES ${progress.lines}/${objective.target}`);
  if (objective.type === 'clearFixed') parts.push(`FIXED ${progress.fixedRemaining}`);
  const limit = objective.type === 'survive' ? (objective.target ?? rules.timeLimitMs) : rules.timeLimitMs;
  if (limit !== undefined) parts.push(`TIME ${formatTime(limit - progress.elapsedMs)}`);
  return parts;
}

// Pushes the board up one row and adds a full garbage row with one hole.
// Returns a new board; `overflowed` is true when blocks were pushed off the top.
function addGarbageRow(board, holeCol) {
  const cols = board[0].length;
  const overflowed = board[0].some(v => v !== 0);
  const garbage = new Array(cols).fill(FIXED_BLOCK);
  garbage[holeCol] = 0;
  return { board: [...board.slice(1).map(row => [...row]), garbage], overflowed };
}

// Returns a list of problems (empty when the level entry is well formed).
function validateLevel(level, cols = 10) {
  const problems = [];
  if (!level || typeof level.id !== 'string' || !level.id) problems.push('id');
  if (!level || typeof level.name !== 'string' || !level.name) problems.push('name');
  if (!level || typeof level.description !== 'string') problems.push('description');
  if (!level || !level.objective || !OBJECTIVE_TYPES.includes(level.objective.type)) {
    problems.push('objective.type');
  } else if (level.objective.type !== 'clearFixed' && !(level.objective.target > 0)) {
    problems.push('objective.target');
  }
  if (!level || !level.rules) problems.push('rules');
  if (!level || !level.defeat || level.defeat.topOut !== true || typeof level.defeat.timeOut !== 'boolean') {
    problems.push('defeat');
  }
  if (problems.length) return problems;
  const preset = level.rules.presetRows;
  if (level.objective.type === 'clearFixed') {
    if (!Array.isArray(preset) || !preset.some(line => line.includes('#'))) problems.push('presetRows');
  }
  if (preset) {
    if (preset.some(line => line.length !== cols || /[^#.]/.test(line))) problems.push('presetRows shape');
    if (preset.some(line => !line.includes('.'))) problems.push('presetRows complete row');
  }
  return problems;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FIXED_BLOCK,
    countFixed,
    buildPresetBoard,
    createProgress,
    evaluate,
    formatTime,
    objectiveText,
    progressText,
    addGarbageRow,
    validateLevel,
  };
}

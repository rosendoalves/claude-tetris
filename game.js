'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - blue
  '#ffb74d', // L - orange
  '#f06292', // PLUS - pink
  '#4db6ac', // U - teal
  '#aed581', // Y - lime
  '#fff176', // SINGLE - light yellow
  '#9575cd', // RING - violet
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const feedbackEl = document.getElementById('feedback');
const freezeEl = document.getElementById('freeze');
const root = document.documentElement;

let gridColor;

function applyTheme(theme) {
  if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
  themeBtn.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
  gridColor = getComputedStyle(root).getPropertyValue('--grid').trim();
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let scoring, lastMoveWasRotation, hold, freezeMs;

// Icon drawn on the block that carries a power-up.
const POWERUP_ICONS = { bomb: '💣', lightning: '⚡', tint: '🎨', gravity: '⬇️', freeze: '❄️' };

// Per-run feature flags. Settings objects (PIECE_SETTINGS...) are never mutated.
const features = { nonStandard: true, powerups: true };

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function createPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: spawnX(COLS, shape[0].length), y: 0 };
}

// Puts a power-up of `kind` on a random filled cell of the piece.
function attachPowerup(piece, kind) {
  piece.powerup = { kind, ...randomFilledCell(piece.shape, Math.random) };
}

function nonStandardOn() {
  return PIECE_SETTINGS.NON_STANDARD_ENABLED && features.nonStandard;
}

function randomPiece() {
  const settings = { ...PIECE_SETTINGS, NON_STANDARD_ENABLED: nonStandardOn() };
  return createPiece(pickPieceType(Math.random, settings));
}

function collide(shape, ox, oy) {
  return collides(board, shape, ox, oy);
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      if (current.powerup) {
        const { kind, r, c } = current.powerup;
        current.powerup = { kind, ...rotatePowerupCell({ r, c }, rotated.length) };
      }
      current.shape = rotated;
      current.x += kick;
      lastMoveWasRotation = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines(tSpin, extraAchievements = []) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  const result = scoreClear(scoring, {
    cleared,
    level,
    tSpin,
    perfectClear: cleared > 0 && isBoardEmpty(board),
  });
  scoring = result.state;
  const previousLines = lines;
  if (cleared) {
    lines += cleared;
    score += result.points;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
    // Every POWERUP_SETTINGS.LINE_INTERVAL lines the upcoming piece carries a power-up.
    if (features.powerups && crossedInterval(previousLines, lines)) {
      attachPowerup(next, pickPowerup(Math.random));
      drawNext();
    }
  }
  const messages = [...extraAchievements, ...result.achievements];
  if (messages.length) showAchievements(messages);
  return cleared;
}

function showAchievements(list) {
  const spans = list.map(text => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  });
  // New elements restart the CSS animation; the last one cleans up.
  spans[spans.length - 1].addEventListener('animationend', () => feedbackEl.replaceChildren());
  feedbackEl.replaceChildren(...spans);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  if (gy > current.y) lastMoveWasRotation = false;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastMoveWasRotation = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

// Applies the special block of the locked piece; returns the name to announce.
function firePowerup() {
  const { kind, r, c } = current.powerup;
  if (kind === 'freeze') {
    freezeMs = POWERUP_SETTINGS.FREEZE_MS;
    updateFreezeEl();
  } else {
    board = applyPowerup(kind, board, current.y + r, current.x + c);
  }
  return POWERUP_NAMES[kind];
}

function lockPiece() {
  const tSpin = isTSpin(board, current, lastMoveWasRotation);
  merge();
  const announced = current.powerup ? [firePowerup()] : [];
  const cleared = clearLines(tSpin, announced);
  hold = unlockHold(hold);
  if (cleared === 4 && nonStandardOn()) spawnReward();
  else spawn();
  drawHold();
}

// A fresh piece that collides on entry means the stack reached the top.
function checkSpawnCollision() {
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
}

function spawn() {
  current = next;
  next = randomPiece();
  lastMoveWasRotation = false;
  checkSpawnCollision();
  drawNext();
}

// Tetris reward: the active piece becomes a fresh SINGLE and the queued next
// piece is left untouched for the following spawn.
function spawnReward() {
  current = createPiece(SINGLE_TYPE);
  lastMoveWasRotation = false;
  checkSpawnCollision();
}

function holdPiece() {
  const result = useHold(hold, current.type, current.powerup ? current.powerup.kind : null);
  if (!result.used) return;
  hold = result.state;
  if (result.swapType === null) {
    spawn();
  } else {
    current = createPiece(result.swapType);
    if (result.swapPowerup) attachPowerup(current, result.swapPowerup);
    lastMoveWasRotation = false;
    checkSpawnCollision();
  }
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawPowerupIcon(context, x, y, size, kind) {
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.font = `${Math.round(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.fillText(POWERUP_ICONS[kind], x * size + size / 2, y * size + size / 2 + 1);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.powerup) {
    drawPowerupIcon(ctx, current.x + current.powerup.c, current.y + current.powerup.r, BLOCK, current.powerup.kind);
  }
}

// Draws a piece centred in a 4x4-cell preview box, so no piece is ever cropped.
function drawPreview(context, targetCanvas, piece) {
  const PB = targetCanvas.width / 4;
  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  if (!piece) return;
  const shape = piece.shape;
  const off = previewOffset(shape, 4);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, off.x + c, off.y + r, shape[r][c], PB);
  if (piece.powerup) drawPowerupIcon(context, off.x + piece.powerup.c, off.y + piece.powerup.r, PB, piece.powerup.kind);
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, next);
}

function drawHold() {
  let held = null;
  if (hold.type) {
    held = createPiece(hold.type);
    // The held kind returns on a random cell; the preview shows a fixed one.
    if (hold.powerup) held.powerup = { kind: hold.powerup, ...randomFilledCell(held.shape, () => 0) };
  }
  drawPreview(holdCtx, holdCanvas, held);
  holdCanvas.classList.toggle('locked', hold.locked);
}

function updateFreezeEl() {
  freezeEl.classList.toggle('hidden', freezeMs <= 0);
  freezeEl.textContent = `CONGELADO ${(Math.max(freezeMs, 0) / 1000).toFixed(1)}s`;
}

// Pause, game over and restart cancel any active freeze entirely.
function cancelFreeze() {
  freezeMs = 0;
  updateFreezeEl();
}

function endGame() {
  gameOver = true;
  cancelFreeze();
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    cancelFreeze();
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeMs > 0) {
    // Frozen: gravity is skipped, manual moves still work.
    freezeMs = Math.max(0, freezeMs - dt);
    updateFreezeEl();
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        lastMoveWasRotation = false;
      } else {
        lockPiece();
      }
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  scoring = createScoringState();
  lastMoveWasRotation = false;
  hold = createHoldState();
  cancelFreeze();
  feedbackEl.replaceChildren();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastMoveWasRotation = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastMoveWasRotation = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', () => {
  const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch (e) {}
  themeBtn.blur(); // evita que Space/Enter vuelvan a activar el botón durante el juego
});

applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');

init();

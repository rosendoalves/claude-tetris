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
const energyWrap = document.getElementById('energy');
const energyFill = document.getElementById('energy-fill');
const effectsEl = document.getElementById('effects');
const visionPanel = document.getElementById('vision-panel');
const visionCanvas = document.getElementById('vision-canvas');
const visionCtx = visionCanvas.getContext('2d');
const abilityMenu = document.getElementById('ability-menu');
const abilityList = document.getElementById('ability-list');
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
// Upcoming pieces after `next` (so next + queue = the Vision window), ability
// energy, vision/slow timers, the one-level undo snapshot and the menu flag.
let queue, energy, timers, undoSnapshot, menuOpen;
const QUEUE_LENGTH = ABILITY_SETTINGS.VISION_COUNT - 1;

// Icon drawn on the block that carries a power-up.
const POWERUP_ICONS = { bomb: '💣', lightning: '⚡', tint: '🎨', gravity: '⬇️', freeze: '❄️' };

// Per-run feature flags. Settings objects (PIECE_SETTINGS...) are never mutated.
const features = { nonStandard: true, powerups: true, abilities: true };

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

function cloneBoard(b) {
  return b.map(row => [...row]);
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
    if (features.abilities) {
      energy = addEnergy(energy, cleared);
      updateEnergyBar();
    }
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
  // One-level undo: board, scoring state and hold as they were before this lock.
  // Score, lines and level are NOT rolled back (only drop points were earned,
  // and undo is refused whenever lines were cleared).
  undoSnapshot = {
    board: cloneBoard(board),
    scoring: { ...scoring },
    hold: { ...hold },
    type: current.type,
    powerup: current.powerup ? current.powerup.kind : null,
    cleared: false,
    firedPowerup: false,
  };
  merge();
  const announced = current.powerup ? [firePowerup()] : [];
  const cleared = clearLines(tSpin, announced);
  undoSnapshot.cleared = cleared > 0;
  undoSnapshot.firedPowerup = announced.length > 0;
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
  next = queue.shift();
  queue.push(randomPiece());
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
// Draws a piece centred in a square box (4x4 cells) at pixel (ox, oy).
function drawPieceInBox(context, piece, ox, oy, box) {
  const PB = box / 4;
  const shape = piece.shape;
  const off = previewOffset(shape, 4);
  const bx = ox / PB + off.x;
  const by = oy / PB + off.y;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, bx + c, by + r, shape[r][c], PB);
  if (piece.powerup) drawPowerupIcon(context, bx + piece.powerup.c, by + piece.powerup.r, PB, piece.powerup.kind);
}

function drawPreview(context, targetCanvas, piece) {
  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  if (piece) drawPieceInBox(context, piece, 0, 0, targetCanvas.width);
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, next);
  drawVision();
}

// Vision shows next + the following pieces while its timer runs.
function drawVision() {
  const active = timers.visionMs > 0;
  visionPanel.classList.toggle('inactive', !active);
  visionCtx.clearRect(0, 0, visionCanvas.width, visionCanvas.height);
  if (!active) return;
  const box = visionCanvas.height / ABILITY_SETTINGS.VISION_COUNT;
  [next, ...queue].slice(0, ABILITY_SETTINGS.VISION_COUNT).forEach((piece, i) => {
    drawPieceInBox(visionCtx, piece, (visionCanvas.width - box) / 2, i * box, box);
  });
}

function updateEnergyBar() {
  const pct = Math.min(100, (energy / ABILITY_SETTINGS.ENERGY_REQUIRED) * 100);
  energyFill.style.width = `${pct}%`;
  energyWrap.classList.toggle('full', canOpenMenu(energy));
}

function updateEffects() {
  const parts = [];
  if (timers.visionMs > 0) parts.push(`VISION ${Math.ceil(timers.visionMs / 1000)}s`);
  if (timers.slowMs > 0) parts.push(`SLOW ${Math.ceil(timers.slowMs / 1000)}s`);
  effectsEl.textContent = parts.join('  ');
}

// ---- Abilities ----
// Candidate types for Intercambio: any spawnable type except the current one
// whose fresh piece fits at the spawn position.
function swapTypes() {
  const types = [];
  for (let t = 1; t <= CLASSIC_COUNT; t++) types.push(t);
  if (nonStandardOn()) types.push(...PENTOMINO_TYPES, RING_TYPE);
  return types.filter(t => {
    if (t === current.type) return false;
    const piece = createPiece(t);
    return !collide(piece.shape, piece.x, piece.y);
  });
}

function undoRespawnFits() {
  if (!undoSnapshot) return false;
  const piece = createPiece(undoSnapshot.type);
  return !collides(undoSnapshot.board, piece.shape, piece.x, piece.y);
}

function abilityContext() {
  return {
    holdLocked: hold.locked,
    swapPossible: swapTypes().length > 0,
    snapshot: undoSnapshot,
    respawnFits: undoRespawnFits(),
  };
}

function renderAbilityMenu() {
  const info = abilityContext();
  Array.from(abilityList.children).forEach(button => {
    const available = isAbilityAvailable(Number(button.dataset.id), info);
    button.disabled = !available;
    button.classList.toggle('unavailable', !available);
  });
}

// Pauses with the same mechanics as P but shows no PAUSA overlay and does not
// cancel a freeze (freezeMs only ticks inside loop, so it simply waits).
function openAbilityMenu() {
  if (!features.abilities || gameOver || paused || menuOpen || !canOpenMenu(energy)) return;
  menuOpen = true;
  paused = true;
  cancelAnimationFrame(animId);
  renderAbilityMenu();
  abilityMenu.classList.remove('hidden');
}

function closeAbilityMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  paused = false;
  abilityMenu.classList.add('hidden');
  lastTime = performance.now();
  loop(lastTime);
}

function undoLastLock() {
  const snap = undoSnapshot;
  const restored = createPiece(snap.type);
  if (snap.powerup) attachPowerup(restored, snap.powerup);
  // The active piece goes back to the front of the queue.
  const returned = createPiece(current.type);
  if (current.powerup) attachPowerup(returned, current.powerup.kind);
  queue.unshift(next);
  next = returned;
  board = cloneBoard(snap.board);
  scoring = { ...snap.scoring };
  hold = { ...snap.hold };
  current = restored;
  undoSnapshot = null;
  lastMoveWasRotation = false;
  dropAccum = 0;
  drawHold();
}

function applyAbility(id) {
  switch (id) {
    case 1:
      timers.visionMs = ABILITY_SETTINGS.VISION_MS;
      break;
    case 2: {
      const types = swapTypes();
      const old = current;
      current = createPiece(types[Math.floor(Math.random() * types.length)]);
      if (old.powerup) attachPowerup(current, old.powerup.kind);
      lastMoveWasRotation = false;
      break;
    }
    case 3:
      timers.slowMs = ABILITY_SETTINGS.SLOW_MS;
      break;
    case 4:
      undoLastLock();
      break;
    case 5:
      hold = unlockHold(hold);
      drawHold();
      break;
  }
}

// An unavailable choice does nothing: the menu stays open and energy is kept.
function chooseAbility(id) {
  if (!menuOpen || !isAbilityAvailable(id, abilityContext())) return;
  applyAbility(id);
  energy = 0;
  updateEnergyBar();
  updateEffects();
  drawNext();
  closeAbilityMenu();
}

ABILITIES.forEach(ability => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.id = String(ability.id);
  button.textContent = `${ability.id}  ${ability.name}`;
  button.addEventListener('click', () => chooseAbility(ability.id));
  abilityList.appendChild(button);
});

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
  // Timers use a clamped dt so a long frame gap (hidden tab, resume) cannot expire them.
  const wasVision = timers.visionMs > 0;
  timers = tickTimers(timers, dt);
  if (timers.visionMs > 0 || timers.slowMs > 0 || wasVision) updateEffects();
  if (wasVision && timers.visionMs === 0) drawVision();
  if (freezeMs > 0) {
    // Frozen: gravity is skipped, manual moves still work.
    freezeMs = Math.max(0, freezeMs - Math.min(dt, MAX_TIMER_TICK_MS));
    updateFreezeEl();
  } else {
    dropAccum += dt;
    if (dropAccum >= effectiveDropInterval(dropInterval, timers.slowMs)) {
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
  energy = 0;
  timers = createTimers();
  undoSnapshot = null;
  menuOpen = false;
  abilityMenu.classList.add('hidden');
  updateEnergyBar();
  updateEffects();
  next = randomPiece();
  queue = Array.from({ length: QUEUE_LENGTH }, randomPiece);
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (menuOpen) {
    // The ability menu owns the keyboard; P is ignored while it is open.
    if (e.code === 'Escape') closeAbilityMenu();
    else {
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) chooseAbility(Number(digit[1]));
    }
    return;
  }
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
    case 'KeyE':
      openAbilityMenu();
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

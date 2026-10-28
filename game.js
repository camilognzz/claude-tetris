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
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Colores del canvas por tema (el CSS no afecta a lo que se dibuja en el canvas)
const THEMES = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)', colors: COLORS },
  light: {
    grid: '#d5d7e3',
    highlight: 'rgba(255,255,255,0.35)',
    colors: [
      null,
      '#00acc1', // I
      '#f9a825', // O
      '#8e24aa', // T
      '#43a047', // S
      '#e53935', // Z
      '#1e88e5', // J
      '#fb8c00', // L
    ],
  },
};
const THEME_KEY = 'tetris-theme';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

// El tema es una preferencia del usuario: no se reinicia en init()
let theme = 'dark';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
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

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // El dibujo concreto depende de la skin activa (ver sección "Skins")
  context.globalAlpha = alpha ?? 1;
  drawSkinBlock(context, x * size, y * size, size, colorIndex);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = skinValue('grid');
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
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
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
  lastTime = performance.now();
  next = randomPiece();
  spawn();
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
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
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
  }
  updateHUD();
});

function applyTheme(name) {
  theme = name;
  document.documentElement.dataset.theme = name;
  const isLight = name === 'light';
  themeBtn.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  themeBtn.setAttribute('aria-pressed', String(isLight));
  // Redibujar una vez: con el juego en pausa el bucle no corre
  if (current) {
    draw();
    drawNext();
  }
}

themeBtn.addEventListener('click', () => {
  const name = theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, name); } catch (e) { /* almacenamiento no disponible */ }
  applyTheme(name);
  themeBtn.blur(); // evita que Space active el botón
});

// ---- Skins visuales ----
// Cada skin define su forma de dibujar un bloque y, opcionalmente, su propia
// paleta y color de rejilla por tema ({ dark, light }). Lo que no defina se
// toma de THEMES[theme]. La skin es una preferencia: no se reinicia en init().
const SKIN_KEY = 'tetris-skin';

function drawRetroBlock(context, px, py, size, color, t) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = t.highlight;
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  const a = context.globalAlpha;
  // relleno tenue sin glow
  context.globalAlpha = a * 0.25;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.globalAlpha = a;
  // borde brillante con glow
  context.shadowColor = color;
  context.shadowBlur = size * 0.4;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 4, py + 4, size - 8, size - 8);
  // núcleo claro
  context.shadowBlur = size * 0.2;
  context.fillStyle = color;
  context.fillRect(px + size / 2 - 2, py + size / 2 - 2, 4, 4);
  // imprescindible: sin esto la rejilla y el resto se dibujarían borrosos
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

function roundRectPath(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
  } else {
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }
}

function drawPastelBlock(context, px, py, size, color) {
  const r = size * 0.28;
  roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.12)';
  context.lineWidth = 1;
  context.stroke();
  // brillo suave en la parte superior
  roundRectPath(context, px + 5, py + 4, size - 10, size * 0.22, r / 2);
  context.fillStyle = 'rgba(255,255,255,0.4)';
  context.fill();
}

function drawPixelBlock(context, px, py, size, color) {
  const p = size / 10; // la celda se divide en 10×10 "píxeles"
  function cell(cx, cy, w, h, style) {
    context.fillStyle = style;
    context.fillRect(Math.round(px + cx * p), Math.round(py + cy * p), Math.round(w * p), Math.round(h * p));
  }
  cell(0, 0, 10, 10, color);
  // bisel: claro arriba/izquierda, oscuro abajo/derecha
  cell(0, 0, 10, 1, 'rgba(255,255,255,0.45)');
  cell(0, 1, 1, 9, 'rgba(255,255,255,0.45)');
  cell(1, 9, 9, 1, 'rgba(0,0,0,0.4)');
  cell(9, 1, 1, 8, 'rgba(0,0,0,0.4)');
  // textura: rejilla de puntos claros/oscuros alternos
  for (let gy = 2; gy < 9; gy += 2)
    for (let gx = 2; gx < 9; gx += 2)
      cell(gx, gy, 1, 1, (gx + gy) % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)');
  // reflejo en la esquina superior izquierda
  cell(2, 2, 2, 1, 'rgba(255,255,255,0.6)');
  cell(2, 3, 1, 1, 'rgba(255,255,255,0.6)');
}

// cached: el bloque se pre-renderiza una vez por color/tamaño/tema en un canvas
// fuera de pantalla (con margen para el glow) y luego se copia con drawImage,
// para no repetir shadowBlur y decenas de fillRect por celda en cada frame.
const SKINS = {
  retro: { draw: drawRetroBlock },
  neon: {
    draw: drawNeonBlock,
    cached: true,
    // El tablero de Neón siempre es negro (ver [data-skin="neon"] en style.css)
    grid: { dark: '#15152a' },
    colors: {
      dark: [null, '#00f0ff', '#fff200', '#ff3df5', '#39ff14', '#ff2a55', '#3d7bff', '#ff9a1f'],
    },
  },
  pastel: {
    draw: drawPastelBlock,
    cached: true,
    colors: {
      dark: [null, '#a8e6ef', '#fff1a8', '#d7b8f3', '#b9e4c9', '#f7b2b7', '#b5d3f5', '#ffd1a6'],
      light: [null, '#7fd3e0', '#f5d76e', '#c39be8', '#93d3ab', '#f09199', '#8fbaf0', '#f7b77d'],
    },
  },
  pixel: { draw: drawPixelBlock, cached: true },
};

const skinSelect = document.getElementById('skin-select');
let skin = 'retro';
const skinCache = new Map();

// Valor de la skin activa para el tema actual, o el de THEMES si no lo define
function skinValue(key) {
  const v = SKINS[skin][key];
  return v ? (v[theme] || v.dark) : THEMES[theme][key];
}

// Dibuja un bloque con la skin activa; globalAlpha ya viene fijado por drawBlock
function drawSkinBlock(context, px, py, size, colorIndex) {
  const s = SKINS[skin];
  const color = skinValue('colors')[colorIndex];
  if (!s.cached) {
    s.draw(context, px, py, size, color, THEMES[theme]);
    return;
  }
  const pad = Math.ceil(size / 2); // margen para que el glow no se recorte
  const key = `${skin}|${theme}|${size}|${color}`;
  let tile = skinCache.get(key);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tile.height = size + pad * 2;
    s.draw(tile.getContext('2d'), pad, pad, size, color, THEMES[theme]);
    skinCache.set(key, tile);
  }
  context.drawImage(tile, px - pad, py - pad);
}

function applySkin(name) {
  skin = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : 'retro';
  document.documentElement.dataset.skin = skin;
  skinSelect.value = skin;
  // Redibujar una vez: con el juego en pausa el bucle no corre
  if (current) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  try { localStorage.setItem(SKIN_KEY, skinSelect.value); } catch (e) { /* almacenamiento no disponible */ }
  applySkin(skinSelect.value);
  skinSelect.blur(); // las flechas vuelven a controlar el juego
});
// Si el selector conserva el foco (p. ej. tras elegir la misma skin), las teclas
// del juego no deben cambiar la opción: se anula su efecto en el <select>, se le
// quita el foco y el evento sigue hasta el manejador del documento (mover/pausar).
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyP'];
skinSelect.addEventListener('keydown', e => {
  if (!GAME_KEYS.includes(e.code)) return;
  e.preventDefault();
  skinSelect.blur();
});

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_KEY); } catch (e) { /* ignorar */ }
applySkin(savedSkin);

restartBtn.addEventListener('click', init);

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
// Sin preferencia guardada, se usa la del sistema operativo
const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
init();
applyTheme(savedTheme === 'light' || (savedTheme === null && prefersLight) ? 'light' : 'dark');

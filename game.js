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
    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  trackCombo(cleared);
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
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lockInputsBriefly();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
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
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  resumeLockUntil = 0;
  heldAtResume.clear();
  closePauseMenu();
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  resetRecordsState();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Escribir en un campo de texto (nombre del record) no debe mover piezas,
  // y antes de pulsar "Jugar" no hay partida que controlar
  if (isTypingTarget(e.target) || !gameStarted) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  // Con el menú abierto solo actúa la navegación nativa (Tab/Enter/Space en botones)
  if (paused) { trapMenuFocus(e); return; }
  if (gameOver) return;
  if (isResumeLocked(e)) return;
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

// ==================== Records locales (localStorage) ====================
// Formato guardado: { top: [{ name, score, lines, level, combo, date }], bestCombo, maxLines }

const RECORDS_KEY = 'tetris-records';
const RECORDS_MAX = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Jugador';

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const startRecordsTable = document.getElementById('start-records-table');
const startClearBtn = document.getElementById('start-clear-btn');
const gameoverRecords = document.getElementById('gameover-records');
const gameoverRecordsTable = document.getElementById('gameover-records-table');
const gameoverClearBtn = document.getElementById('gameover-clear-btn');
const recordsNew = document.getElementById('records-new');
const recordsForm = document.getElementById('records-form');
const recordsName = document.getElementById('records-name');

// No se reinicia en init(): solo pasa a true al pulsar "Jugar" por primera vez
let gameStarted = false;
// Estado por partida (se reinicia en init() vía resetRecordsState)
// savedEntry: entrada de esta partida ya guardada en el top (el formulario solo la renombra)
let combo = 0, maxComboThisGame = 0, savedEntry = null, focusTimer = 0;

recordsName.maxLength = NAME_MAX;

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function loadRecords() {
  let raw = null;
  try { raw = localStorage.getItem(RECORDS_KEY); } catch (e) { /* almacenamiento no disponible */ }
  if (!raw) return emptyRecords();
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = (Array.isArray(data.top) ? data.top : [])
      .filter(r => r && typeof r === 'object' && toCount(r.score) > 0)
      .map(r => ({
        name: String(r.name ?? DEFAULT_NAME).slice(0, NAME_MAX) || DEFAULT_NAME,
        score: toCount(r.score),
        lines: toCount(r.lines),
        level: toCount(r.level) || 1,
        combo: toCount(r.combo),
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RECORDS_MAX);
    return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch (e) {
    return emptyRecords(); // datos corruptos
  }
}

function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* ignorar */ }
}

function qualifiesForTop(records, s) {
  if (s <= 0) return false;
  return records.top.length < RECORDS_MAX || s > records.top[records.top.length - 1].score;
}

// Combo = bloqueos consecutivos que eliminan al menos una línea
function trackCombo(cleared) {
  combo = cleared ? combo + 1 : 0;
  if (combo > maxComboThisGame) maxComboThisGame = combo;
}

function resetRecordsState() {
  combo = 0;
  maxComboThisGame = 0;
  savedEntry = null;
  clearTimeout(focusTimer);
  gameoverRecords.classList.add('hidden');
  resetClearButton(gameoverClearBtn);
}

// Una entrada se identifica por su fecha + puntuación (los objetos se recrean al cargar)
function findEntryIndex(records, entry) {
  if (!entry) return -1;
  return records.top.findIndex(r => r.date === entry.date && r.score === entry.score);
}

function renderRecords(container, records, highlightIndex) {
  container.replaceChildren();

  const title = document.createElement('p');
  title.className = 'records-title';
  title.textContent = 'TOP 5';
  container.appendChild(title);

  if (!records.top.length) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Aún no hay records';
    container.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    const head = table.createTHead().insertRow();
    for (const h of ['#', 'Nombre', 'Puntos', 'Líneas', 'Nivel']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    const body = table.createTBody();
    records.top.forEach((r, i) => {
      const row = body.insertRow();
      if (i === highlightIndex) row.className = 'current';
      // textContent: el nombre lo escribe el usuario y no debe interpretarse como HTML
      for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.level]) {
        row.insertCell().textContent = v;
      }
    });
    container.appendChild(table);
  }

  const stats = document.createElement('p');
  stats.className = 'records-stats';
  const addStat = (label, value) => {
    stats.append(`${label}: `);
    const strong = document.createElement('strong');
    strong.textContent = value;
    stats.appendChild(strong);
  };
  addStat('Mejor combo', records.bestCombo);
  stats.append(' · ');
  addStat('Líneas máx.', records.maxLines);
  container.appendChild(stats);
}

function showGameOverRecords() {
  const records = loadRecords();
  let changed = false;
  if (maxComboThisGame > records.bestCombo) { records.bestCombo = maxComboThisGame; changed = true; }
  if (lines > records.maxLines) { records.maxLines = lines; changed = true; }

  // Si la puntuación entra en el top se guarda ya con el nombre por defecto, para no
  // perderla si se reinicia o se cierra la pestaña; el formulario solo la renombra
  const qualifies = qualifiesForTop(records, score);
  savedEntry = null;
  if (qualifies) {
    savedEntry = { name: DEFAULT_NAME, score, lines, level, combo: maxComboThisGame, date: new Date().toISOString() };
    records.top.push(savedEntry);
    records.top.sort((a, b) => b.score - a.score);
    records.top = records.top.slice(0, RECORDS_MAX);
    changed = true;
  }
  if (changed) saveRecords(records);

  recordsNew.classList.toggle('hidden', !qualifies);
  recordsForm.classList.toggle('hidden', !qualifies);
  recordsName.value = DEFAULT_NAME;
  renderRecords(gameoverRecordsTable, records, findEntryIndex(records, savedEntry));
  gameoverRecords.classList.remove('hidden');
  if (qualifies) {
    // Pequeño retraso: las teclas que se estaban pulsando al perder no deben acabar en el campo
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      if (gameOver && savedEntry) { recordsName.focus(); recordsName.select(); }
    }, 600);
  }
}

function saveCurrentRecord() {
  if (!savedEntry) return;
  const records = loadRecords();
  const idx = findEntryIndex(records, savedEntry);
  if (idx !== -1) {
    records.top[idx].name = recordsName.value.trim().slice(0, NAME_MAX) || DEFAULT_NAME;
    saveRecords(records);
  }
  savedEntry = null;
  recordsForm.classList.add('hidden');
  recordsName.blur();
  renderRecords(gameoverRecordsTable, records, idx);
}

// Borrado en dos clics (sin confirm()): el primero pide confirmación
function resetClearButton(btn) {
  clearTimeout(btn._confirmTimer);
  btn.classList.remove('confirm');
  btn.textContent = 'Borrar records';
}

function onClearClick(btn) {
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.textContent = '¿Seguro?';
    btn.blur(); // Space/Enter no deben confirmar el borrado por accidente
    clearTimeout(btn._confirmTimer);
    btn._confirmTimer = setTimeout(() => resetClearButton(btn), 3000);
    return;
  }
  resetClearButton(btn);
  btn.blur();
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignorar */ }
  savedEntry = null;
  recordsForm.classList.add('hidden');
  recordsNew.classList.add('hidden');
  // Solo se redibuja la tabla visible; la de inicio se regenera en showStartScreen()
  const container = btn === startClearBtn ? startRecordsTable : gameoverRecordsTable;
  renderRecords(container, emptyRecords(), -1);
}

// Solo campos de texto: un <select> (skin, nivel inicial) reenvía las teclas del juego
function isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function showStartScreen() {
  renderRecords(startRecordsTable, loadRecords(), -1);
  startScreen.classList.remove('hidden');
}

function startGame() {
  startBtn.blur(); // evita que Space vuelva a pulsar el botón
  startScreen.classList.add('hidden');
  resetClearButton(startClearBtn);
  gameStarted = true;
  init();
}

startBtn.addEventListener('click', startGame);
startClearBtn.addEventListener('click', () => onClearClick(startClearBtn));
gameoverClearBtn.addEventListener('click', () => onClearClick(gameoverClearBtn));
recordsForm.addEventListener('submit', e => {
  e.preventDefault(); // Enter en el campo también envía el formulario
  saveCurrentRecord();
});

// ---- Menú de pausa ----
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 10;
const RESUME_LOCK_MS = 150;

// El nivel inicial es una preferencia del usuario: no se reinicia en init()
let startLevel = 1;
// Estado por partida (se reinicia en init()): nivel con el que empezó la partida
// y bloqueo de inputs tras reanudar
let gameStartLevel = 1, resumeLockUntil = 0;
const heldAtResume = new Set();
// Teclas físicamente pulsadas ahora mismo (no es estado de partida)
const heldKeys = new Set();

function openPauseMenu() {
  pauseControls.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  controlsBtn.textContent = 'Ver controles';
  startLevelSelect.value = String(startLevel);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  // Quitar el foco evita que Space/Enter vuelvan a activar un botón del menú
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  pauseMenu.classList.add('hidden');
}

// Tras reanudar se ignoran las teclas un instante, y las que siguieran pulsadas
// hasta que se suelten, para evitar movimientos accidentales
function lockInputsBriefly() {
  resumeLockUntil = performance.now() + RESUME_LOCK_MS;
  heldAtResume.clear();
  heldKeys.forEach(code => heldAtResume.add(code));
}

function isResumeLocked(e) {
  return performance.now() < resumeLockUntil || heldAtResume.has(e.code);
}

// Mantiene el foco de Tab dentro del menú (es un diálogo modal)
function trapMenuFocus(e) {
  if (e.key !== 'Tab') return;
  const items = [...pauseMenu.querySelectorAll('button, select')];
  const first = items[0], last = items[items.length - 1];
  const inside = pauseMenu.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
    e.preventDefault();
    first.focus();
  }
}

function restartFromMenu() {
  init();
  lockInputsBriefly();
}

function setStartLevel(value) {
  const n = parseInt(value, 10);
  startLevel = Number.isInteger(n) ? Math.min(MAX_START_LEVEL, Math.max(1, n)) : 1;
  startLevelSelect.value = String(startLevel);
}

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', restartFromMenu);

controlsBtn.addEventListener('click', () => {
  const show = pauseControls.classList.toggle('hidden') === false;
  controlsBtn.setAttribute('aria-expanded', String(show));
  controlsBtn.textContent = show ? 'Ocultar controles' : 'Ver controles';
});

startLevelSelect.addEventListener('change', () => {
  setStartLevel(startLevelSelect.value);
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) { /* almacenamiento no disponible */ }
});

document.addEventListener('keydown', e => heldKeys.add(e.code));
document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  heldAtResume.delete(e.code);
});
// Si la ventana pierde el foco no llegan los keyup: se olvida lo pulsado
window.addEventListener('blur', () => {
  heldKeys.clear();
  heldAtResume.clear();
});

let savedStartLevel = null;
try { savedStartLevel = localStorage.getItem(START_LEVEL_KEY); } catch (e) { /* ignorar */ }
setStartLevel(savedStartLevel);

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
// Sin preferencia guardada, se usa la del sistema operativo
const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
// La partida no empieza hasta pulsar "Jugar" en la pantalla de inicio
showStartScreen();
applyTheme(savedTheme === 'light' || (savedTheme === null && prefersLight) ? 'light' : 'dark');

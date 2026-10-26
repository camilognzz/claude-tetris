# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no tests, no linter. The README and all user-facing UI text are in Spanish — keep new UI strings in Spanish.

## Running

Open `index.html` directly in a browser, or serve the folder statically (recommended):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Architecture

Three files: `index.html` (DOM: board canvas, side panel, overlay), `style.css` (dark theme), and `game.js` (all logic). `game.js` is a single classic script (not a module) loaded at the end of `<body>`; it grabs DOM elements by id at top level and calls `init()` on load.

Key conventions in `game.js`:

- **Cell value = piece type = color index.** Pieces in `PIECES` are square matrices whose non-zero entries are the piece's type (1–7); that same number is written into `board` on lock and used to index `COLORS`. Index 0 is `null` in both arrays. Adding a piece means updating `PIECES`, `COLORS`, and the `* 7` in `randomPiece()`.
- **Global mutable state** (`board`, `current`, `next`, `score`, `level`, `dropInterval`, `animId`, …) declared with one `let` and fully reset in `init()`, which is also the restart handler. Any new state must be reset there.
- **`collide(shape, x, y)`** is the single source of truth for legality — movement, rotation (`tryRotate` with simple horizontal kicks `[0,-1,1,-2,2]`), ghost projection (`ghostY`), and game-over detection in `spawn()` all go through it. Cells with `y < 0` are allowed (above the board).
- **Lock pipeline:** `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()` (game over if the new piece collides immediately).
- **Loop:** `requestAnimationFrame`-driven `loop()` accumulates `dt` into `dropAccum` and does a gravity step when it exceeds `dropInterval`; it redraws the whole board every frame. Pause/game over stop the loop via `cancelAnimationFrame(animId)`; unpausing restarts it by calling `loop()` directly.

## Coupled dimensions

`COLS × BLOCK` and `ROWS × BLOCK` must match the `<canvas id="board">` `width`/`height` in `index.html` (currently 300×600). The next-piece preview assumes a 4×4 grid of 30px blocks (`NB` in `drawNext`) matching the 120×120 `#next-canvas`.

/* ================================================================
   src/gfx/keyboardViz.ts
   Clavier visuel PixiJS — touches qui s'allument sur note_on
================================================================ */

import { Application, Graphics, Container } from 'pixi.js';
import {
  KEYBOARD_MIN_MIDI,
  KEYBOARD_MAX_MIDI,
  COLOR_KEY_WHITE,
  COLOR_KEY_BLACK,
  COLOR_KEY_ACTIVE,
} from '../constants';
import {
  isBlackKey,
  noteIdToX,
  whiteKeyWidth,
} from '../utils/midiUtils';

// ─────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────

interface KeyGraphic {
  gfx:     Graphics;
  isBlack: boolean;
  noteId:  number;
}

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _keys: Map<number, KeyGraphic> = new Map();
let _container: Container | null = null;
let _canvasWidth  = 0;
let _canvasHeight = 0;
let _minMidi = KEYBOARD_MIN_MIDI;
let _maxMidi = KEYBOARD_MAX_MIDI;

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Initialise le clavier visuel dans l'application PixiJS donnée.
 * @param app      - Instance PixiJS
 * @param minMidi  - Note la plus basse affichée (défaut: KEYBOARD_MIN_MIDI)
 * @param maxMidi  - Note la plus haute affichée (défaut: KEYBOARD_MAX_MIDI)
 */
export function initKeyboardViz(
  app: Application,
  minMidi: number = KEYBOARD_MIN_MIDI,
  maxMidi: number = KEYBOARD_MAX_MIDI
): void {
  _minMidi      = minMidi;
  _maxMidi      = maxMidi;
  _canvasWidth  = app.screen.width;
  _canvasHeight = app.screen.height;

  _container = new Container();
  app.stage.addChild(_container);

  _buildKeys();
  console.log(`[KeyboardViz] Clavier initialisé (MIDI ${minMidi}–${maxMidi})`);
}

/**
 * Allume une touche (note_on).
 */
export function keyOn(noteId: number): void {
  const key = _keys.get(noteId);
  if (!key) return;
  _drawKey(key, true);
}

/**
 * Éteint une touche (note_off).
 */
export function keyOff(noteId: number): void {
  const key = _keys.get(noteId);
  if (!key) return;
  _drawKey(key, false);
}

/**
 * Éteint toutes les touches (ex: au retour au menu).
 */
export function allKeysOff(): void {
  for (const key of _keys.values()) {
    _drawKey(key, false);
  }
}

// ─────────────────────────────────────────────
// Construction du clavier
// ─────────────────────────────────────────────

function _buildKeys(): void {
  if (!_container) return;
  _container.removeChildren();
  _keys.clear();

  const wWidth  = whiteKeyWidth(_minMidi, _maxMidi, _canvasWidth);
  const wHeight = _canvasHeight;
  const bWidth  = wWidth * 0.6;
  const bHeight = wHeight * 0.62;

  // ── Passe 1 : touches blanches (fond) ──
  for (let noteId = _minMidi; noteId <= _maxMidi; noteId++) {
    if (isBlackKey(noteId)) continue;

    const gfx = new Graphics();
    const x   = noteIdToX(noteId, _minMidi, _maxMidi, _canvasWidth) - wWidth / 2;

    _drawWhiteKey(gfx, x, wWidth, wHeight, false);
    _container.addChild(gfx);
    _keys.set(noteId, { gfx, isBlack: false, noteId });
  }

  // ── Passe 2 : touches noires (par-dessus) ──
  for (let noteId = _minMidi; noteId <= _maxMidi; noteId++) {
    if (!isBlackKey(noteId)) continue;

    const gfx = new Graphics();
    const cx  = noteIdToX(noteId, _minMidi, _maxMidi, _canvasWidth);
    const x   = cx - bWidth / 2;

    _drawBlackKey(gfx, x, bWidth, bHeight, false);
    _container.addChild(gfx);
    _keys.set(noteId, { gfx, isBlack: true, noteId });
  }
}

// ─────────────────────────────────────────────
// Dessin des touches
// ─────────────────────────────────────────────

function _drawKey(key: KeyGraphic, active: boolean): void {
  const wWidth  = whiteKeyWidth(_minMidi, _maxMidi, _canvasWidth);
  const bWidth  = wWidth * 0.6;
  const bHeight = _canvasHeight * 0.62;

  if (key.isBlack) {
    const cx = noteIdToX(key.noteId, _minMidi, _maxMidi, _canvasWidth);
    _drawBlackKey(key.gfx, cx - bWidth / 2, bWidth, bHeight, active);
  } else {
    const x = noteIdToX(key.noteId, _minMidi, _maxMidi, _canvasWidth) - wWidth / 2;
    _drawWhiteKey(key.gfx, x, wWidth, _canvasHeight, active);
  }
}

function _drawWhiteKey(
  gfx: Graphics,
  x: number,
  w: number,
  h: number,
  active: boolean
): void {
  const fillColor   = active ? COLOR_KEY_ACTIVE : COLOR_KEY_WHITE;
  const borderColor = 0x888888;

  gfx.clear();
  gfx
    .rect(x + 1, 0, w - 2, h - 2)
    .fill({ color: fillColor })
    .stroke({ color: borderColor, width: 1 });
}

function _drawBlackKey(
  gfx: Graphics,
  x: number,
  w: number,
  h: number,
  active: boolean
): void {
  const fillColor = active ? COLOR_KEY_ACTIVE : COLOR_KEY_BLACK;

  gfx.clear();
  gfx
    .rect(x, 0, w, h)
    .fill({ color: fillColor });
}

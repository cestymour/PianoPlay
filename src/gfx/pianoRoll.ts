/* ================================================================
   src/gfx/pianoRoll.ts
   Piano Roll PixiJS — NoteBlocks qui défilent de haut en bas
   + Object pooling pour la performance
================================================================ */

import { Application, Graphics, Container } from 'pixi.js';
import {
  SCROLL_SPEED_PX_PER_SEC,
  NOTE_HEIGHT_PX,
  KEYBOARD_MIN_MIDI,
  KEYBOARD_MAX_MIDI,
  COLOR_NOTE_DEFAULT,
  COLOR_NOTE_HIT,
  COLOR_NOTE_MISS,
} from '../constants';
import {
  noteIdToX,
  whiteKeyWidth,
  isBlackKey,
} from '../utils/midiUtils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type NoteBlockState = 'falling' | 'hit' | 'miss';

interface NoteBlock {
  gfx:     Graphics;
  noteId:  number;
  y:       number;       // Position Y courante (px)
  state:   NoteBlockState;
  active:  boolean;      // Dans le pool : true = en cours d'utilisation
}

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _app:       Application | null = null;
let _container: Container   | null = null;

let _canvasWidth  = 0;
let _canvasHeight = 0;
let _minMidi      = KEYBOARD_MIN_MIDI;
let _maxMidi      = KEYBOARD_MAX_MIDI;

// Object pool
const POOL_SIZE   = 64;
const _pool:      NoteBlock[] = [];

// ─────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────

/**
 * Initialise le piano roll dans l'application PixiJS donnée.
 * Doit être appelé AVANT la game loop.
 *
 * @param app     - Instance PixiJS dédiée au piano roll
 * @param minMidi - Note la plus basse affichée (doit correspondre au clavier visuel)
 * @param maxMidi - Note la plus haute affichée
 */
export function initPianoRoll(
  app:      Application,
  minMidi:  number = KEYBOARD_MIN_MIDI,
  maxMidi:  number = KEYBOARD_MAX_MIDI,
): void {
  _app          = app;
  _canvasWidth  = app.screen.width;
  _canvasHeight = app.screen.height;
  _minMidi      = minMidi;
  _maxMidi      = maxMidi;

  _container = new Container();
  app.stage.addChild(_container);

  _buildPool();
  console.log(`[PianoRoll] Initialisé (${_canvasWidth}×${_canvasHeight}, pool=${POOL_SIZE})`);
}

// ─────────────────────────────────────────────
// Object Pool
// ─────────────────────────────────────────────

function _buildPool(): void {
  if (!_container) return;

  for (let i = 0; i < POOL_SIZE; i++) {
    const gfx = new Graphics();
    gfx.visible = false;
    _container.addChild(gfx);

    _pool.push({
      gfx,
      noteId: 0,
      y:      0,
      state:  'falling',
      active: false,
    });
  }
}

/**
 * Récupère un NoteBlock libre dans le pool.
 * Retourne null si le pool est épuisé (ne devrait pas arriver avec POOL_SIZE=64).
 */
function _acquireBlock(): NoteBlock | null {
  for (const block of _pool) {
    if (!block.active) return block;
  }
  console.warn('[PianoRoll] Pool épuisé !');
  return null;
}

/**
 * Libère un NoteBlock et le remet dans le pool.
 */
function _releaseBlock(block: NoteBlock): void {
  block.active      = false;
  block.gfx.visible = false;
  block.gfx.clear();
}

// ─────────────────────────────────────────────
// Spawn d'un NoteBlock (Mode Libre : note jouée)
// ─────────────────────────────────────────────

/**
 * Fait apparaître un NoteBlock en bas du piano roll (zone de frappe)
 * qui remonte brièvement pour confirmer la réception MIDI.
 *
 * En Mode Libre : la note spawn en bas et monte pendant ~400ms,
 * simulant un "rebond" visuel de confirmation.
 *
 * @param noteId - NoteID MIDI de la note à afficher
 */
export function spawnNoteBlock(noteId: number): void {
  if (noteId < _minMidi || noteId > _maxMidi) return;

  const block = _acquireBlock();
  if (!block) return;

  block.noteId = noteId;
  block.y      = _canvasHeight; // Spawn en bas
  block.state  = 'falling';
  block.active = true;

  _drawBlock(block);
  block.gfx.visible = true;
}

// ─────────────────────────────────────────────
// Update (appelé par la game loop à chaque frame)
// ─────────────────────────────────────────────

/**
 * Met à jour la position de tous les NoteBlocks actifs.
 * En Mode Libre, les blocs montent (vitesse négative).
 *
 * @param deltaMs - Temps écoulé depuis la dernière frame (ms)
 */
export function updatePianoRoll(deltaMs: number): void {
  const deltaSec  = deltaMs / 1000;
  const speedPxS  = SCROLL_SPEED_PX_PER_SEC;

  for (const block of _pool) {
    if (!block.active) continue;

    // En Mode Libre : les blocs montent (rebond de confirmation)
    block.y -= speedPxS * deltaSec;

    // Hors écran vers le haut → on libère
    if (block.y + NOTE_HEIGHT_PX < 0) {
      _releaseBlock(block);
      continue;
    }

    // Mise à jour de la position visuelle
    block.gfx.y = block.y;
  }
}

// ─────────────────────────────────────────────
// Feedback couleur (pour l'étape 7 — Validation)
// ─────────────────────────────────────────────

/**
 * Change l'état visuel d'un NoteBlock (hit / miss).
 * Prévu pour l'étape 7, déjà câblé ici pour ne pas refactorer.
 *
 * @param noteId - NoteID de la note à coloriser
 * @param state  - 'hit' (vert) ou 'miss' (rouge)
 */
export function setNoteBlockState(noteId: number, state: 'hit' | 'miss'): void {
  // On cherche le bloc actif le plus récent pour ce noteId
  for (const block of _pool) {
    if (block.active && block.noteId === noteId) {
      block.state = state;
      _drawBlock(block);
      return;
    }
  }
}

/**
 * Libère tous les blocs actifs (ex: retour au menu, changement de mode).
 */
export function clearPianoRoll(): void {
  for (const block of _pool) {
    if (block.active) _releaseBlock(block);
  }
}

// ─────────────────────────────────────────────
// Rendu d'un NoteBlock
// ─────────────────────────────────────────────

function _drawBlock(block: NoteBlock): void {
  const color = _colorForState(block.state);
  const x     = noteIdToX(block.noteId, _minMidi, _maxMidi, _canvasWidth);
  const w     = _noteWidth(block.noteId);
  const h     = NOTE_HEIGHT_PX;

  block.gfx.clear();
  block.gfx
    .rect(x - w / 2, 0, w, h)
    .fill({ color })
    .stroke({ color: 0x000000, width: 1 });

  // La position Y est gérée via gfx.y dans updatePianoRoll
}

/**
 * Calcule la largeur du bloc selon qu'il est blanc ou noir.
 * Les touches noires sont plus étroites → blocs plus étroits.
 */
function _noteWidth(noteId: number): number {
  const ww = whiteKeyWidth(_minMidi, _maxMidi, _canvasWidth);
  return isBlackKey(noteId) ? ww * 0.55 : ww * 0.9;
}

function _colorForState(state: NoteBlockState): number {
  switch (state) {
    case 'hit':  return COLOR_NOTE_HIT;
    case 'miss': return COLOR_NOTE_MISS;
    default:     return COLOR_NOTE_DEFAULT;
  }
}

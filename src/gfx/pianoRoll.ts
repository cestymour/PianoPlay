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
  gfx:      Graphics;
  noteId:   number;
  topY:     number;      // Position Y du haut du bloc (monte dans le temps)
  anchorY:  number;      // Position Y du bas du bloc (fixe pendant l'appui)
  held:     boolean;     // true = touche encore enfoncée
  state:    NoteBlockState;
  active:   boolean;
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

const POOL_SIZE = 64;
const _pool: NoteBlock[] = [];

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
  app:     Application,
  minMidi: number = KEYBOARD_MIN_MIDI,
  maxMidi: number = KEYBOARD_MAX_MIDI,
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
      noteId:  0,
      topY:    0,
      anchorY: 0,
      held:    false,
      state:   'falling',
      active:  false,
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
  block.held        = false;
  block.gfx.visible = false;
  block.gfx.clear();
}

// ─────────────────────────────────────────────
// API publique — note_on / note_off
// ─────────────────────────────────────────────

/**
 * Appelé au note_on : crée un bloc ancré en bas, qui commence à monter.
 */
export function noteOnPianoRoll(noteId: number): void {
  if (noteId < _minMidi || noteId > _maxMidi) return;

  const block = _acquireBlock();
  if (!block) return;

  block.noteId  = noteId;
  block.anchorY = _canvasHeight;        // Bas du bloc : ancré en bas du canvas
  block.topY    = _canvasHeight;        // Haut du bloc : part du même endroit
  block.held    = true;                 // Touche enfoncée
  block.state   = 'falling';
  block.active  = true;

  block.gfx.visible = true;
  _drawBlock(block);
}

/**
 * Appelé au note_off : le bloc se détache et part vers le haut.
 */
export function noteOffPianoRoll(noteId: number): void {
  // On cherche le bloc tenu le plus récent pour ce noteId
  for (const block of _pool) {
    if (block.active && block.held && block.noteId === noteId) {
      block.held = false; // Le bas se décroche, la taille est figée
      return;
    }
  }
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
  const deltaSec = deltaMs / 1000;
  const speed    = SCROLL_SPEED_PX_PER_SEC;

  for (const block of _pool) {
    if (!block.active) continue;

    // Le haut monte toujours
    block.topY -= speed * deltaSec;

    if (block.held) {
      // Touche enfoncée : le bas reste ancré → le bloc grandit
      // anchorY reste fixe, on ne le bouge pas
    } else {
      // Touche relâchée : le bas monte à la même vitesse → taille figée
      block.anchorY -= speed * deltaSec;
    }

    // Hors écran vers le haut → libération
    if (block.anchorY < 0) {
      _releaseBlock(block);
      continue;
    }

    _drawBlock(block);
  }
}

// ─────────────────────────────────────────────
// Feedback couleur (étape 7)
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
 * Libère tous les blocs actifs (retour menu, changement de mode).
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
  const color  = _colorForState(block.state);
  const x      = noteIdToX(block.noteId, _minMidi, _maxMidi, _canvasWidth);
  const w      = _noteWidth(block.noteId);
  const height = block.anchorY - block.topY;  // Hauteur dynamique

  // Sécurité : ne pas dessiner un bloc de hauteur nulle ou négative
  if (height <= 0) return;

  block.gfx.clear();
  block.gfx.position.set(0, block.topY);  // On positionne le container au topY
  block.gfx
    .rect(x - w / 2, 0, w, height)        // Le rect part de 0 (relatif au container)
    .fill({ color })
    .stroke({ color: 0x000000, width: 1 });
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

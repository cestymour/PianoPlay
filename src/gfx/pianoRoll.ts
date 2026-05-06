/* ================================================================
   src/gfx/pianoRoll.ts
   Piano Roll PixiJS — NoteBlocks qui défilent
   + Object pooling pour la performance
   + Support Mode Libre (monte) et Mode Lecture (descend)
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

/** Mode de défilement du piano roll */
export type PianoRollMode = 'free' | 'read';

interface NoteBlock {
  gfx:      Graphics;
  noteId:   number;
  topY:     number;    // Position Y du haut du bloc
  anchorY:  number;    // Position Y du bas du bloc
  held:     boolean;   // true = touche encore enfoncée (Mode Libre)
                       // true = note pas encore terminée (Mode Lecture)
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

/** Mode actuel : 'free' (blocs montent) ou 'read' (blocs descendent) */
let _mode: PianoRollMode = 'free';

const POOL_SIZE = 128; // Agrandi pour le Mode Lecture (plus de notes simultanées)
const _pool: NoteBlock[] = [];

// ─────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────

/**
 * Initialise le piano roll dans l'application PixiJS donnée.
 * Doit être appelé AVANT la game loop.
 *
 * @param app     - Instance PixiJS dédiée au piano roll
 * @param minMidi - Note la plus basse affichée
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

/**
 * Définit le mode de défilement du piano roll.
 * - 'free' : les blocs montent (Mode Libre, note jouée → confirmation visuelle)
 * - 'read' : les blocs descendent depuis le haut (Mode Lecture, notes à jouer)
 *
 * À appeler avant de démarrer la lecture ou le mode libre.
 *
 * @param mode - 'free' ou 'read'
 */
export function setPianoRollMode(mode: PianoRollMode): void {
  _mode = mode;
  clearPianoRoll();
  console.log(`[PianoRoll] Mode : ${mode}`);
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
 * Retourne null si le pool est épuisé.
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
// API publique — Mode Libre (note_on / note_off)
// ─────────────────────────────────────────────

/**
 * Mode Libre — note_on : crée un bloc ancré en bas qui monte.
 * Mode Lecture — ne pas appeler directement, utiliser spawnReadNote().
 */
export function noteOnPianoRoll(noteId: number): void {
  if (_mode !== 'free') return;
  if (noteId < _minMidi || noteId > _maxMidi) return;

  const block = _acquireBlock();
  if (!block) return;

  block.noteId  = noteId;
  block.anchorY = _canvasHeight;  // Bas du bloc ancré en bas du canvas
  block.topY    = _canvasHeight;  // Haut du bloc part du même endroit
  block.held    = true;           // Touche enfoncée
  block.state   = 'falling';
  block.active  = true;

  block.gfx.visible = true;
  _drawBlock(block);
}

/**
 * Mode Libre — note_off : détache le bas du bloc, la taille est figée.
 */
export function noteOffPianoRoll(noteId: number): void {
  if (_mode !== 'free') return;

  for (const block of _pool) {
    if (block.active && block.held && block.noteId === noteId) {
      block.held = false;
      return;
    }
  }
}

// ─────────────────────────────────────────────
// API publique — Mode Lecture
// ─────────────────────────────────────────────

/**
 * Mode Lecture — Fait apparaître un bloc en haut du canvas avec
 * une hauteur proportionnelle à sa durée. Le bloc descend vers la
 * ligne de frappe.
 *
 * @param noteId     - NoteID MIDI (0–127)
 * @param durationMs - Durée de la note en millisecondes
 * @param offsetMs   - Décalage temporel avant que la note atteigne
 *                     la ligne de frappe (lookahead). Correspond à
 *                     la hauteur du piano roll divisée par la vitesse.
 */
export function spawnReadNote(
  noteId:     number,
  durationMs: number,
  offsetMs:   number,
): void {
  if (_mode !== 'read') return;
  if (noteId < _minMidi || noteId > _maxMidi) return;

  const block = _acquireBlock();
  if (!block) return;

  // Hauteur du bloc proportionnelle à la durée
  const blockHeight = (durationMs / 1000) * SCROLL_SPEED_PX_PER_SEC;
  // Le bas du bloc démarre au-dessus du canvas (offsetMs = temps avant impact)
  const anchorY = -((offsetMs / 1000) * SCROLL_SPEED_PX_PER_SEC);

  block.noteId  = noteId;
  block.anchorY = anchorY;                   // Bas du bloc (bord inférieur)
  block.topY    = anchorY - blockHeight;     // Haut du bloc
  block.held    = true;                      // La note est "active" (pas encore passée)
  block.state   = 'falling';
  block.active  = true;

  block.gfx.visible = true;
  _drawBlock(block);
}

// ─────────────────────────────────────────────
// Update (appelé par la game loop à chaque frame)
// ─────────────────────────────────────────────

/**
 * Met à jour la position de tous les NoteBlocks actifs.
 *
 * - Mode Libre : les blocs montent (haut de l'écran)
 * - Mode Lecture : les blocs descendent (bas de l'écran = ligne de frappe)
 *
 * @param deltaMs - Temps écoulé depuis la dernière frame (ms)
 */
export function updatePianoRoll(deltaMs: number): void {
  const deltaSec = deltaMs / 1000;
  const speed    = SCROLL_SPEED_PX_PER_SEC;

  for (const block of _pool) {
    if (!block.active) continue;

    if (_mode === 'free') {
      // ── Mode Libre : les blocs montent ──────────────────────────
      block.topY -= speed * deltaSec;

      if (block.held) {
        // Touche enfoncée : le bas reste ancré → le bloc grandit
      } else {
        // Touche relâchée : le bas monte aussi → taille figée
        block.anchorY -= speed * deltaSec;
      }

      // Hors écran vers le haut → libération
      if (block.anchorY < 0) {
        _releaseBlock(block);
        continue;
      }

    } else {
      // ── Mode Lecture : les blocs descendent ─────────────────────
      block.topY    += speed * deltaSec;
      block.anchorY += speed * deltaSec;

      // Hors écran vers le bas → libération
      if (block.topY > _canvasHeight) {
        _releaseBlock(block);
        continue;
      }
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
  const height = block.anchorY - block.topY;

  // Sécurité : ne pas dessiner un bloc de hauteur nulle ou négative
  if (height <= 0) return;

  block.gfx.clear();
  block.gfx.position.set(0, block.topY);
  block.gfx
    .rect(x - w / 2, 0, w, height)
    .fill({ color })
    .stroke({ color: 0x000000, width: 1 });
}

/**
 * Calcule la largeur du bloc selon qu'il est blanc ou noir.
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

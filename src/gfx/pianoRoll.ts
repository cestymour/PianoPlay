/* ================================================================
   src/gfx/pianoRoll.ts
   Piano Roll PixiJS — NoteBlocks qui défilent
   + Object pooling pour la performance
   + Support Mode Libre (monte) et Mode Lecture (descend)
================================================================ */

import { Application, Graphics, Container } from 'pixi.js';
import {
  SCROLL_SPEED_PX_PER_SEC,
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

let _container: Container   | null = null;

let _canvasWidth  = 0;
let _canvasHeight = 0;
let _minMidi      = KEYBOARD_MIN_MIDI;
let _maxMidi      = KEYBOARD_MAX_MIDI;

/** Mode actuel : 'free' (blocs montent) ou 'read' (blocs descendent) */
let _mode: PianoRollMode = 'free';

const POOL_SIZE = 128; // Agrandi pour le Mode Lecture (plus de notes simultanées)
const _pool: NoteBlock[] = [];

/**
 * Piles LIFO par pitch MIDI : chaque note_on associe un bloc précis ; seul le sommet
 * reçoit le glow (comportement voix / relâchements comme sur un synthé).
 */
const _voiceStacks = new Map<number, NoteBlock[]>();

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

function _purgeBlockFromVoiceStacks(block: NoteBlock): void {
  const nid = block.noteId;
  const st = _voiceStacks.get(nid);
  if (!st) return;
  const ix = st.indexOf(block);
  if (ix < 0) return;
  st.splice(ix, 1);
  if (st.length === 0) _voiceStacks.delete(nid);
}

/**
 * Libère un NoteBlock et le remet dans le pool.
 */
function _releaseBlock(block: NoteBlock): void {
  _purgeBlockFromVoiceStacks(block);
  block.active      = false;
  block.held        = false;
  block.gfx.visible = false;
  block.gfx.clear();
  _redrawBlocksForMidiNote(block.noteId);
}

// ─────────────────────────────────────────────
// API publique — Mode Libre (note_on / note_off)
// ─────────────────────────────────────────────

/**
 * Mode Libre — note_on : crée un bloc ancré en bas qui monte.
 * Mode Lecture — ne pas appeler directement, utiliser spawnReadNote().
 */
export function noteOnPianoRoll(noteId: number): void {
  if (noteId < _minMidi || noteId > _maxMidi) return;

  if (_mode === 'free') {
    const block = _acquireBlock();
    if (!block) return;

    block.noteId  = noteId;
    block.anchorY = _canvasHeight;  // Bas du bloc ancré en bas du canvas
    block.topY    = _canvasHeight;  // Haut du bloc part du même endroit
    block.held    = true;           // Touche enfoncée
    block.state   = 'falling';
    block.active  = true;

    block.gfx.visible = true;
    _voicePush(noteId, block);
  } else {
    const block = _pickReadModeGlowBlock(noteId);
    if (block) _voicePush(noteId, block);
  }
}

/**
 * Mode Libre — note_off : détache le bas du bloc, la taille est figée.
 */
export function noteOffPianoRoll(noteId: number): void {
  if (noteId < _minMidi || noteId > _maxMidi) return;

  const popped = _voicePop(noteId);

  if (_mode === 'free' && popped && popped.active) {
    popped.held = false;
  }

  _redrawBlocksForMidiNote(noteId);
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
 * @param offsetMs   - Temps restant (ms) avant que le **bas** du bloc atteigne
 *                     le bas du canvas (= ligne de frappe / alignement clavier).
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
  // Bas du bloc : à offsetMs=0 il est sur le bas du canvas ; plus tôt il est plus haut
  const anchorY =
    _canvasHeight - ((Math.max(0, offsetMs) / 1000) * SCROLL_SPEED_PX_PER_SEC);

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
  _voiceStacks.clear();
  for (const block of _pool) {
    if (!block.active) continue;
    block.active = false;
    block.held = false;
    block.gfx.visible = false;
    block.gfx.clear();
  }
}

// ─────────────────────────────────────────────
// Voix MIDI (LIFO) + rendu
// ─────────────────────────────────────────────

function _voicePush(noteId: number, block: NoteBlock): void {
  let st = _voiceStacks.get(noteId);
  if (!st) {
    st = [];
    _voiceStacks.set(noteId, st);
  }
  st.push(block);
  _redrawBlocksForMidiNote(noteId);
}

function _voicePop(noteId: number): NoteBlock | undefined {
  const st = _voiceStacks.get(noteId);
  if (!st || st.length === 0) return undefined;
  const b = st.pop()!;
  if (st.length === 0) _voiceStacks.delete(noteId);
  return b;
}

function _isBlockInAnyVoiceStack(block: NoteBlock): boolean {
  for (const st of _voiceStacks.values()) {
    if (st.includes(block)) return true;
  }
  return false;
}

/** Bloc « attendu » en lecture : le plus bas à l’écran parmi ceux non déjà liés à une voix. */
function _pickReadModeGlowBlock(noteId: number): NoteBlock | null {
  const cands: NoteBlock[] = [];
  for (const b of _pool) {
    if (!b.active || b.noteId !== noteId) continue;
    if (_isBlockInAnyVoiceStack(b)) continue;
    cands.push(b);
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.anchorY - a.anchorY);
  return cands[0];
}

function _isVoiceGlowTop(block: NoteBlock): boolean {
  const st = _voiceStacks.get(block.noteId);
  if (!st || st.length === 0) return false;
  return st[st.length - 1] === block;
}

function _smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function _mixTowardWhite(hex: number, t: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const l = (c: number) => Math.round(c + (255 - c) * t);
  return (l(r) << 16) | (l(g) << 8) | l(b);
}

const _GLOW_LAYERS = 12;
const _GLOW_STEP_PX = 1.35;

function _redrawBlocksForMidiNote(noteId: number): void {
  for (const block of _pool) {
    if (block.active && block.noteId === noteId) _drawBlock(block);
  }
}

function _drawBlock(block: NoteBlock): void {
  const color  = _colorForState(block.state);
  const x      = noteIdToX(block.noteId, _minMidi, _maxMidi, _canvasWidth);
  const w      = _noteWidth(block.noteId);
  const height = block.anchorY - block.topY;

  // Sécurité : ne pas dessiner un bloc de hauteur nulle ou négative
  if (height <= 0) return;

  const glow = _isVoiceGlowTop(block);
  // Rayon plus marqué ; plafond ~ demi-min côté pour éviter la forme « pilule » extrême
  const baseR = Math.min(20, Math.max(4, Math.min(w, height) * 0.26));

  block.gfx.clear();
  block.gfx.position.set(0, block.topY);

  if (glow) {
    for (let i = _GLOW_LAYERS; i >= 1; i--) {
      const pad = i * _GLOW_STEP_PX;
      const u = i / _GLOW_LAYERS;
      const falloff = _smoothstep01(1 - u);
      const alpha = 0.018 + falloff * falloff * 0.2;
      const lighten = 0.25 + (1 - falloff) * 0.55;
      const glowColor = _mixTowardWhite(color, lighten);
      const rw = w + pad * 2;
      const rh = height + pad * 2;
      const rx = x - rw / 2;
      const ry = -pad;
      const r = Math.min(baseR + pad * 0.58, Math.min(rw, rh) * 0.47);
      block.gfx.roundRect(rx, ry, rw, rh, r).fill({ color: glowColor, alpha });
    }
  }

  block.gfx
    .roundRect(x - w / 2, 0, w, height, baseR)
    .fill({ color })
    .stroke(
      glow
        ? { color: _mixTowardWhite(color, 0.72), width: 2.2, alpha: 0.92 }
        : { color: 0x000000, width: 1 },
    );
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

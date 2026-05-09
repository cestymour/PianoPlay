/* ================================================================
   src/core/keyboardDebug.ts
   Simulation MIDI via clavier AZERTY — DEBUG UNIQUEMENT
   
   Mapping 2 octaves (C4–E5) :
   q z s e d f t g y h u j k o l p m
================================================================ */

import type { MidiNote } from './midiEngine';

// ─────────────────────────────────────────────
// Mapping touche → NoteID MIDI
// ─────────────────────────────────────────────

const KEY_TO_MIDI: Record<string, number> = {
  q: 60, // C4
  z: 61, // C#4
  s: 62, // D4
  e: 63, // D#4
  d: 64, // E4
  f: 65, // F4
  t: 66, // F#4
  g: 67, // G4
  y: 68, // G#4
  h: 69, // A4
  u: 70, // A#4
  j: 71, // B4
  k: 72, // C5
  o: 73, // C#5
  l: 74, // D5
  p: 75, // D#5
  m: 76, // E5
};

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _onNoteOn:  ((note: MidiNote) => void) | null = null;
let _onNoteOff: ((note: MidiNote) => void) | null = null;
let _active = false;

// Touches actuellement enfoncées (pour ignorer la répétition auto)
const _heldKeys = new Set<string>();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToName(noteId: number): string {
  const octave = Math.floor(noteId / 12) - 1;
  const name   = NOTE_NAMES[noteId % 12];
  return `${name}${octave}`;
}

function makeMidiNote(noteId: number): MidiNote {
  return {
    noteId,
    velocity:  80,               // Vélocité fixe arbitraire pour le debug
    timestamp: performance.now(),
    name:      midiToName(noteId),
  };
}

// ─────────────────────────────────────────────
// Listeners
// ─────────────────────────────────────────────

function _onKeyDown(e: KeyboardEvent): void {
  // Ignorer si un champ texte est actif (input, textarea...)
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // Ignorer la répétition automatique du navigateur
  if (e.repeat) return;

  const noteId = KEY_TO_MIDI[e.key];
  if (noteId === undefined) return;

  // Ignorer si déjà tenu (sécurité supplémentaire)
  if (_heldKeys.has(e.key)) return;
  _heldKeys.add(e.key);

  const note = makeMidiNote(noteId);
  console.log(`[KeyboardDebug] note_on  → ${note.name} (id=${note.noteId}) [${e.key}]`);
  _onNoteOn?.(note);
}

function _onKeyUp(e: KeyboardEvent): void {
  const noteId = KEY_TO_MIDI[e.key];
  if (noteId === undefined) return;

  _heldKeys.delete(e.key);

  const note = makeMidiNote(noteId);
  console.log(`[KeyboardDebug] note_off → ${note.name} (id=${note.noteId}) [${e.key}]`);
  _onNoteOff?.(note);
}

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Active la simulation clavier AZERTY.
 * Les callbacks reçoivent des MidiNote identiques à ceux de midiEngine.ts,
 * ce qui permet de brancher exactement les mêmes handlers.
 *
 * @param onNoteOn  - Même callback que celui passé à initMidi()
 * @param onNoteOff - Même callback que celui passé à initMidi()
 */
export function initKeyboardDebug(
  onNoteOn:  (note: MidiNote) => void,
  onNoteOff: (note: MidiNote) => void,
): void {
  if (_active) return;

  _onNoteOn  = onNoteOn;
  _onNoteOff = onNoteOff;
  _active    = true;

  window.addEventListener('keydown', _onKeyDown);
  window.addEventListener('keyup',   _onKeyUp);

  console.log('[KeyboardDebug] Simulation AZERTY activée (C4–E5)');
}

/**
 * Désactive la simulation et retire les listeners.
 */
export function disposeKeyboardDebug(): void {
  if (!_active) return;

  window.removeEventListener('keydown', _onKeyDown);
  window.removeEventListener('keyup',   _onKeyUp);

  _heldKeys.clear();
  _active    = false;
  _onNoteOn  = null;
  _onNoteOff = null;

  console.log('[KeyboardDebug] Simulation AZERTY désactivée');
}

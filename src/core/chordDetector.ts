/* ================================================================
   src/core/chordDetector.ts
   Regroupe les note_on simultanés dans une fenêtre de ~30ms
   et émet un "accord" (tableau de MidiNote) à chaque changement.
================================================================ */

import type { MidiNote } from './midiEngine';
import { CHORD_DETECTION_WINDOW_MS } from '../constants';

export type ChordCallback = (activeNotes: MidiNote[]) => void;

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

// Map des notes actuellement enfoncées : noteId → MidiNote
const _heldNotes = new Map<number, MidiNote>();

// Timer de debounce pour le regroupement
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Callbacks enregistrés
const _callbacks: ChordCallback[] = [];

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Enregistre un callback appelé à chaque changement d'état des notes tenues.
 * Reçoit le tableau complet des notes actuellement enfoncées.
 */
export function onChordChange(cb: ChordCallback): void {
  _callbacks.push(cb);
}

/**
 * À appeler sur chaque événement note_on reçu du midiEngine.
 */
export function handleNoteOn(note: MidiNote): void {
  _heldNotes.set(note.noteId, note);
  _scheduleEmit();
}

/**
 * À appeler sur chaque événement note_off reçu du midiEngine.
 */
export function handleNoteOff(note: MidiNote): void {
  _heldNotes.delete(note.noteId);
  _scheduleEmit();
}

/**
 * Retourne la liste des notes actuellement enfoncées.
 */
export function getHeldNotes(): MidiNote[] {
  return Array.from(_heldNotes.values());
}

// ─────────────────────────────────────────────
// Logique interne
// ─────────────────────────────────────────────

/**
 * Déclenche l'émission après la fenêtre de regroupement.
 * Si un nouveau note_on arrive dans la fenêtre, le timer est réinitialisé.
 */
function _scheduleEmit(): void {
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    _emit();
  }, CHORD_DETECTION_WINDOW_MS);
}

function _emit(): void {
  const activeNotes = Array.from(_heldNotes.values());
  console.log(`[ChordDetector] Accord : ${activeNotes.map(n => n.name).join(', ') || '(silence)'}`);
  for (const cb of _callbacks) {
    cb(activeNotes);
  }
}

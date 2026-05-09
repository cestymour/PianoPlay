/* ================================================================
   src/core/readModeScheduler.ts
   Scheduler du Mode Lecture — Avance le temps de lecture et
   déclenche les NoteBlocks au bon moment dans le piano roll.

   Principe :
   - Le temps courant avance à chaque frame (via la game loop).
   - On maintient un index "prochain événement à planifier".
   - On spawne les blocs avec un lookahead = hauteur du canvas / vitesse,
     pour qu'ils arrivent sur la ligne de frappe exactement au bon moment.
================================================================ */

import { ParsedNote } from './fileParser';
import { spawnReadNote } from '../gfx/pianoRoll';
import { SCROLL_SPEED_PX_PER_SEC } from '../constants';
import {
  previewNoteOn,
  previewNoteOff,
  releaseAllPreviewNotes,
} from '../audio/midiPianoPreview';

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _notes:         ParsedNote[] = [];
let _currentTimeMs  = 0;
let _nextNoteIndex  = 0;
let _pianoRollHeight = 0;

/** Temps en ms que met un bloc pour parcourir toute la hauteur du canvas */
let _lookaheadMs    = 0;

let _running        = false;
let _onComplete:    (() => void) | null = null;

/** Index de la prochaine note à « jouer » en audio (instant startMs du morceau) */
let _nextPlaybackAudioIndex = 0;

/** Timers note_off pour la lecture fichier (annulés à pause / stop) */
let _playbackOffTimeouts: ReturnType<typeof setTimeout>[] = [];

/** true si initScheduler a reçu au moins une note (mode lecture morceau) */
let _filePlaybackAudioActive = false;

function _clearPlaybackOffTimers(): void {
  for (const id of _playbackOffTimeouts) {
    clearTimeout(id);
  }
  _playbackOffTimeouts = [];
}

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Initialise le scheduler avec les notes d'une piste et la hauteur
 * du piano roll (nécessaire pour calculer le lookahead).
 *
 * @param notes           - Notes parsées de la piste sélectionnée
 * @param pianoRollHeight - Hauteur en pixels du canvas piano roll
 * @param onComplete      - Callback appelé quand toutes les notes sont passées
 */
export function initScheduler(
  notes:           ParsedNote[],
  pianoRollHeight: number,
  onComplete?:     () => void,
): void {
  _notes           = [...notes].sort((a, b) => a.startMs - b.startMs);
  _currentTimeMs   = 0;
  _nextNoteIndex   = 0;
  _pianoRollHeight = pianoRollHeight;
  _running         = false;
  _onComplete      = onComplete ?? null;

  // Lookahead = temps pour traverser tout le canvas à vitesse constante
  // ex: 600px / 200px/s = 3000ms
  _lookaheadMs = (pianoRollHeight / SCROLL_SPEED_PX_PER_SEC) * 1000;

  _clearPlaybackOffTimers();
  _filePlaybackAudioActive = _notes.length > 0;
  if (_filePlaybackAudioActive) {
    releaseAllPreviewNotes();
  }
  _nextPlaybackAudioIndex = 0;

  console.log(`[Scheduler] Init : ${_notes.length} notes, lookahead=${_lookaheadMs.toFixed(0)}ms`);
}

/**
 * Démarre ou reprend la lecture.
 */
export function startScheduler(): void {
  _running = true;
  console.log('[Scheduler] Démarré');
}

/**
 * Met en pause la lecture.
 */
export function pauseScheduler(): void {
  _running = false;
  if (_filePlaybackAudioActive) {
    _clearPlaybackOffTimers();
    releaseAllPreviewNotes();
  }
  console.log('[Scheduler] En pause');
}

/**
 * Arrête et réinitialise la lecture.
 */
export function stopScheduler(): void {
  _running       = false;
  _currentTimeMs = 0;
  _nextNoteIndex = 0;
  _clearPlaybackOffTimers();
  _nextPlaybackAudioIndex = 0;
  if (_filePlaybackAudioActive) {
    releaseAllPreviewNotes();
  }
  _filePlaybackAudioActive = false;
  console.log('[Scheduler] Arrêté');
}

/**
 * Retourne le temps de lecture courant en ms.
 */
export function getCurrentTimeMs(): number {
  return _currentTimeMs;
}

/**
 * Délai entre l'apparition d'un bloc en haut du piano roll et son arrivée
 * sur la ligne de frappe (bas du canvas), en ms — même valeur que pour le spawn.
 * Sert à synchroniser la portée (OSMD) sur l'impact des notes, pas sur leur apparition.
 */
export function getSchedulerLookaheadMs(): number {
  return _lookaheadMs;
}

/**
 * Indique si le scheduler est en cours de lecture.
 */
export function isSchedulerRunning(): boolean {
  return _running;
}

/**
 * Update appelé à chaque frame par la game loop.
 * Avance le temps et spawne les notes dont le moment est venu.
 *
 * @param deltaMs - Temps écoulé depuis la dernière frame
 */
export function updateScheduler(deltaMs: number): void {
  if (!_running) return;

  _currentTimeMs += deltaMs;

  // ── Audio morceau (MIDI / MXL) : attaque à startMs, relâchement après durationMs
  if (_filePlaybackAudioActive) {
    const PLAYBACK_VELOCITY = 82;
    while (
      _nextPlaybackAudioIndex < _notes.length &&
      _notes[_nextPlaybackAudioIndex].startMs <= _currentTimeMs
    ) {
      const n = _notes[_nextPlaybackAudioIndex];
      previewNoteOn(n.noteId, PLAYBACK_VELOCITY);
      const holdMs = Math.max(45, Math.min(n.durationMs, 20_000));
      const id = window.setTimeout(() => {
        previewNoteOff(n.noteId);
      }, holdMs);
      _playbackOffTimeouts.push(id);
      _nextPlaybackAudioIndex++;
    }
  }

  // On spawne toutes les notes dont le startMs <= currentTimeMs + lookahead
  // Ainsi le bloc arrive sur la ligne de frappe exactement à startMs
  while (
    _nextNoteIndex < _notes.length &&
    _notes[_nextNoteIndex].startMs <= _currentTimeMs + _lookaheadMs
  ) {
    const note = _notes[_nextNoteIndex];

    // offsetMs = temps restant avant que la note doive être jouée
    const offsetMs = note.startMs - _currentTimeMs;

    spawnReadNote(note.noteId, note.durationMs, Math.max(0, offsetMs));

    _nextNoteIndex++;
  }

  // Fin du morceau : toutes les notes ont été spawnées et le temps
  // dépasse la dernière note + son lookahead
  if (
    _nextNoteIndex >= _notes.length &&
    _notes.length > 0
  ) {
    const lastNote = _notes[_notes.length - 1];
    const endMs    = lastNote.startMs + lastNote.durationMs + _lookaheadMs;

    if (_currentTimeMs >= endMs) {
      _running = false;
      console.log('[Scheduler] Morceau terminé');
      _onComplete?.();
    }
  }
}

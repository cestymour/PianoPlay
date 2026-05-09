/* ================================================================
   src/audio/midiPianoPreview.ts
   Préécoute piano : même chaîne que GAMME/gammes_musicales.html —
   Tone.Sampler (Salamander) + Tone.Reverb (decay / wet identiques).
================================================================ */

import { Reverb, Sampler, start } from 'tone';

/** Même jeu d’échantillons et URL que `GAMME/gammes_musicales.html`. */
const SALAMANDER_URLS = {
  C4: 'C4.ogg',
  'D#4': 'Ds4.ogg',
  'F#4': 'Fs4.ogg',
  A4: 'A4.ogg',
  C5: 'C5.ogg',
} as const;

const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

let _sampler: Sampler | null = null;
let _unlockInstalled = false;

function _midiToNote(noteId: number): string {
  const pc = noteId % 12;
  const oct = Math.floor(noteId / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

function _ensureSampler(): Sampler {
  if (!_sampler) {
    const reverb = new Reverb({ decay: 2.2, wet: 0.25 }).toDestination();
    _sampler = new Sampler({
      urls: SALAMANDER_URLS,
      baseUrl: SALAMANDER_BASE,
    }).connect(reverb);
  }
  return _sampler;
}

/** Courbe vélocité (inchangée côté ressenti dynamique). */
function _velocityToGain(velocity: number): number {
  const n = Math.max(0.02, Math.min(1, velocity / 127));
  return Math.pow(n, 0.82);
}

/**
 * Installe un déverrouillage unique du contexte audio (politique navigateur).
 * À appeler une fois au chargement de l’app.
 */
export function installAudioUnlockOnFirstGesture(): void {
  if (_unlockInstalled) return;
  _unlockInstalled = true;

  const unlock = (): void => {
    void start()
      .then(() => {
        _ensureSampler();
      })
      .catch(() => {
        /* contexte déjà démarré ou refus utilisateur */
      });
    document.body.removeEventListener('pointerdown', unlock, true);
    document.body.removeEventListener('keydown', unlock, true);
  };

  document.body.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.body.addEventListener('keydown', unlock, { capture: true, passive: true });
}

/**
 * Note on — vélocité MIDI 0–127 → attaque sur la fréquence de la note.
 */
export function previewNoteOn(noteId: number, velocity: number): void {
  if (noteId < 0 || noteId > 127) return;
  if (velocity <= 0) {
    previewNoteOff(noteId);
    return;
  }
  const sampler = _ensureSampler();
  const vel = _velocityToGain(velocity);
  const note = _midiToNote(noteId);
  try {
    sampler.triggerAttack(note, undefined, vel);
  } catch {
    /* contexte suspendu ou buffers pas encore prêts */
  }
}

/**
 * Note off — relâche la voix correspondant à cette hauteur.
 */
export function previewNoteOff(noteId: number): void {
  if (noteId < 0 || noteId > 127) return;
  if (!_sampler) return;
  try {
    _sampler.triggerRelease(_midiToNote(noteId));
  } catch {
    /* idem */
  }
}

/**
 * Coupe toutes les notes (retour menu, etc.).
 */
export function releaseAllPreviewNotes(): void {
  try {
    _sampler?.releaseAll();
  } catch {
    /* */
  }
}

/* ================================================================
   src/audio/midiPianoPreview.ts
   Son de préécoute type piano (synthé FM polyphonique) via Tone.js.
   Déclenché par les note_on / note_off MIDI (tous les modes).
================================================================ */

import { PolySynth, FMSynth, Frequency, start } from 'tone';

let _synth: PolySynth<FMSynth> | null = null;
let _unlockInstalled = false;

function _getSynth(): PolySynth<FMSynth> {
  if (!_synth) {
    _synth = new PolySynth({
      maxPolyphony: 48,
      voice:        FMSynth,
      options: {
        harmonicity:   2.5,
        modulationIndex: 6,
        oscillator:    { type: 'triangle' },
        envelope: {
          attack:  0.002,
          decay:   0.22,
          sustain: 0.15,
          release: 0.45,
        },
        modulation: { type: 'sine' },
        modulationEnvelope: {
          attack:  0.01,
          decay:   0.2,
          sustain: 0.06,
          release: 0.28,
        },
      },
    }).toDestination();
    _synth.volume.value = -10;
  }
  return _synth;
}

function _midiToFreq(noteId: number): number {
  return Frequency(noteId, 'midi').toFrequency();
}

/**
 * Installe un déverrouillage unique du contexte audio (politique navigateur).
 * À appeler une fois au chargement de l'app.
 */
export function installAudioUnlockOnFirstGesture(): void {
  if (_unlockInstalled) return;
  _unlockInstalled = true;

  const unlock = (): void => {
    void start().catch(() => {
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
  const vel = Math.max(0.02, Math.min(1, velocity / 127));
  try {
    const freq = _midiToFreq(noteId);
    _getSynth().triggerAttack(freq, undefined, vel);
  } catch {
    /* contexte suspendu avant premier geste */
  }
}

/**
 * Note off — relâche la voix correspondant à cette hauteur.
 */
export function previewNoteOff(noteId: number): void {
  if (noteId < 0 || noteId > 127) return;
  try {
    const freq = _midiToFreq(noteId);
    _getSynth().triggerRelease(freq);
  } catch {
    /* idem */
  }
}

/**
 * Coupe toutes les notes (retour menu, etc.).
 */
export function releaseAllPreviewNotes(): void {
  try {
    _synth?.releaseAll();
  } catch {
    /* */
  }
}

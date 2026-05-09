/* ================================================================
   src/notation/staffFreeMode.ts
   Portée VexFlow — affichage temps réel des accords (Mode Libre)
   Compatible VexFlow 4.2.x
================================================================ */

import {
    Renderer,
    Stave,
    StaveNote,
    Voice,
    Formatter,
    Accidental,
} from 'vexflow';
import type { MidiNote } from '../core/midiEngine';

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _container: HTMLElement | null = null;
let _renderer:  Renderer | null = null;
let _width  = 0;
let _height = 0;

// ─────────────────────────────────────────────
// Helpers de conversion
// ─────────────────────────────────────────────

/**
 * Convertit un NoteID MIDI en clé VexFlow (ex: 65 → "f/4").
 * VexFlow utilise le format "note/octave" en minuscules.
 */
function midiToVexKey(noteId: number): string {
  const NOTE_NAMES_VEXFLOW = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const octave = Math.floor(noteId / 12) - 1;
  const name   = NOTE_NAMES_VEXFLOW[noteId % 12];
  return `${name}/${octave}`;
}

/**
 * Détermine si une clé VexFlow nécessite un accidental (#).
 */
function needsAccidental(vexKey: string): boolean {
  return vexKey.includes('#');
}

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Initialise le rendu VexFlow dans le conteneur DOM donné.
 * @param container - L'élément #zone-staff
 */
export function initStaffFreeMode(container: HTMLElement): void {
  _container = container;
  _width     = container.clientWidth  || 800;
  _height    = container.clientHeight || 150;

  // Nettoyage préventif
  container.innerHTML = '';

  _renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  _renderer.resize(_width, _height);

  // Rendu initial : portée vide
  renderChord([]);
  console.log('[StaffFreeMode] VexFlow initialisé');
}

/**
 * Met à jour la portée avec les notes actuellement enfoncées.
 * Appelé à chaque changement détecté par le ChordDetector.
 * @param activeNotes - Tableau des MidiNote actives (peut être vide)
 */
export function renderChord(activeNotes: MidiNote[]): void {
  if (!_renderer || !_container) return;

  const context = _renderer.getContext();
  context.clear();

  // -- Portée --
  const staveX     = 20;
  const staveY     = 20;
  const staveWidth = _width - 40;

  const stave = new Stave(staveX, staveY, staveWidth);
  stave.addClef('treble').addTimeSignature('4/4');
  stave.setContext(context).draw();

  let staveNote: StaveNote;

  if (activeNotes.length === 0) {
    // Mesure vide : une ronde de silence
    staveNote = new StaveNote({
      keys:     ['b/4'],
      duration: 'wr',       // whole rest
    });
  } else {
    // Tri des notes par hauteur (grave → aigu) pour VexFlow
    const sorted = [...activeNotes].sort((a, b) => a.noteId - b.noteId);
    const keys   = sorted.map(n => midiToVexKey(n.noteId));

    staveNote = new StaveNote({
      keys,
      duration: 'w',        // Ronde : représente l'état instantané
      clef:     'treble',
    });

    // Ajout des accidentels nécessaires
    keys.forEach((key, index) => {
      if (needsAccidental(key)) {
        staveNote.addModifier(new Accidental('#'), index);
      }
    });
  }

  // ── Voice et formatage ──
  const voice = new Voice({ num_beats: 4, beat_value: 4 });
  voice.setStrict(false);   // Évite les erreurs sur les rondes d'accord
  voice.addTickables([staveNote]);

  new Formatter()
    .joinVoices([voice])
    .format([voice], staveWidth - 80);

  voice.draw(context, stave);
}

/**
 * Vide la portée (retour au silence).
 */
export function clearStaff(): void {
  renderChord([]);
}

/**
 * Détruit le rendu VexFlow et nettoie le DOM.
 */
export function disposeStaffFreeMode(): void {
  if (_container) _container.innerHTML = '';
  _renderer  = null;
  _container = null;
}

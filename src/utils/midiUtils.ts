/* ================================================================
   src/utils/midiUtils.ts
   Utilitaires de conversion MIDI → données visuelles
================================================================ */

// Noms des notes dans une octave (notation anglaise)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Pattern des touches noires dans une octave (index 0=C)
// true = touche noire
const BLACK_KEY_PATTERN = [false, true, false, true, false, false, true, false, true, false, true, false];

// ─────────────────────────────────────────────
// Informations sur une note
// ─────────────────────────────────────────────

/**
 * Retourne le nom de la note (ex: "C4", "F#3") depuis un NoteID MIDI.
 */
export function midiToNoteName(noteId: number): string {
  const octave = Math.floor(noteId / 12) - 1;
  const name   = NOTE_NAMES[noteId % 12];
  return `${name}${octave}`;
}

/**
 * Retourne true si le NoteID correspond à une touche noire.
 */
export function isBlackKey(noteId: number): boolean {
  return BLACK_KEY_PATTERN[noteId % 12];
}

// ─────────────────────────────────────────────
// Calcul de la position X sur le clavier visuel
// ─────────────────────────────────────────────

/**
 * Compte le nombre de touches blanches entre minMidi et noteId (exclu).
 */
function countWhiteKeysBefore(noteId: number, minMidi: number): number {
  let count = 0;
  for (let i = minMidi; i < noteId; i++) {
    if (!isBlackKey(i)) count++;
  }
  return count;
}

/**
 * Compte le nombre total de touches blanches dans la plage [minMidi, maxMidi].
 */
export function countWhiteKeysInRange(minMidi: number, maxMidi: number): number {
  let count = 0;
  for (let i = minMidi; i <= maxMidi; i++) {
    if (!isBlackKey(i)) count++;
  }
  return count;
}

/**
 * Calcule la position X du centre d'une touche (blanche ou noire)
 * dans la zone de clavier de largeur `canvasWidth`.
 *
 * @param noteId     - NoteID MIDI de la note
 * @param minMidi    - NoteID minimum affiché (bord gauche)
 * @param maxMidi    - NoteID maximum affiché (bord droit)
 * @param canvasWidth - Largeur totale du canvas en pixels
 * @returns Position X en pixels (centre de la touche)
 */
export function noteIdToX(
  noteId: number,
  minMidi: number,
  maxMidi: number,
  canvasWidth: number
): number {
  const totalWhites   = countWhiteKeysInRange(minMidi, maxMidi);
  const whiteKeyWidth = canvasWidth / totalWhites;

  if (!isBlackKey(noteId)) {
    // Touche blanche : centre = index blanc × largeur + demi-largeur
    const whiteIndex = countWhiteKeysBefore(noteId, minMidi);
    return whiteIndex * whiteKeyWidth + whiteKeyWidth / 2;
  } else {
    // Touche noire : centrée sur la jonction entre la blanche gauche et la blanche droite
    const leftWhiteIndex = countWhiteKeysBefore(noteId, minMidi);
    return leftWhiteIndex * whiteKeyWidth + whiteKeyWidth;
  }
}

/**
 * Calcule la largeur d'une touche blanche en pixels.
 */
export function whiteKeyWidth(minMidi: number, maxMidi: number, canvasWidth: number): number {
  return canvasWidth / countWhiteKeysInRange(minMidi, maxMidi);
}

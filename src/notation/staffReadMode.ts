/* ================================================================
   src/notation/staffReadMode.ts
   Mode Lecture MXL — Portée défilante OSMD
   + Collecte des GraphicalNotes pour feedback vert/rouge (étape 7)

   Principe :
   - OSMD charge et rend le fichier .mxl dans zone-staff.
   - On collecte TOUS les GraphicalNotes après le rendu, indexés
     par leur pitch MIDI pour permettre la coloration à l'étape 7.
   - Le curseur OSMD est synchronisé avec le temps de lecture via
     updateStaffReadMode() appelé par la game loop.
   - La coloration est exposée via colorGraphicalNote() — appelée
     par validator.ts à l'étape 7.
================================================================ */

import { OpenSheetMusicDisplay, Cursor } from 'opensheetmusicdisplay';
import type { ParsedNote } from '../core/fileParser';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/**
 * Un GraphicalNote collecté après le rendu OSMD.
 * Contient la référence à l'objet OSMD et le pitch MIDI calculé.
 */
interface CollectedNote {
  /** Objet GraphicalNote interne OSMD */
  gn:      any;
  /** NoteID MIDI (0–127) calculé depuis le pitch MusicXML */
  noteId:  number;
  /** Temps de début en millisecondes (calculé depuis la position dans la partition) */
  startMs: number;
  /** Durée en ms (via OSMD PlaybackSettings — aligné tempo / mesures) */
  durationMs: number;
  /** true = déjà colorée (hit ou miss) — évite une double coloration */
  colored: boolean;
}

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _osmd:            OpenSheetMusicDisplay | null = null;
let _cursor:          Cursor | null                = null;
let _container:       HTMLElement | null           = null;
let _collectedNotes:  CollectedNote[]              = [];
let _ready            = false;

// ─────────────────────────────────────────────
// API publique — Initialisation
// ─────────────────────────────────────────────

/**
 * Charge et rend un fichier .mxl dans le conteneur de la zone portée.
 * Collecte les GraphicalNotes après le rendu.
 *
 * @param container - L'élément DOM #zone-staff
 * @param mxlBuffer - Contenu binaire du fichier .mxl (ArrayBuffer)
 * @returns         - Durée totale estimée du morceau en ms (pour le scheduler)
 */
export async function initStaffReadMode(
  container: HTMLElement,
  mxlBuffer: ArrayBuffer,
  mimeType:  'application/vnd.recordare.musicxml' | 'text/xml' = 'application/vnd.recordare.musicxml',
): Promise<number> {
  _disposeOsmd();

  _container = container;
  _ready     = false;

  // ── Instanciation OSMD ─────────────────────────────────────────
  _osmd = new OpenSheetMusicDisplay(container, {
    autoResize:    true,
    drawTitle:     false,
    drawCredits:   false,
    followCursor:  true,   // OSMD défile automatiquement avec le curseur
  });

  // ── Chargement du buffer ───────────────────────────────────────
  // OSMD accepte un ArrayBuffer directement depuis la v0.9+
  const blob = new Blob([mxlBuffer], { type: mimeType });
  await _osmd.load(blob);
  await _osmd.render();

  console.log('[StaffReadMode] OSMD rendu OK');

  // ── Collecte des GraphicalNotes ────────────────────────────────
  _collectGraphicalNotes();

  // ── Initialisation du curseur ──────────────────────────────────
  _osmd.cursor.show();
  _cursor = _osmd.cursor;

  _ready = true;

  // Durée estimée : fin de la dernière note + petite marge
  const durationMs = _collectedNotes.length > 0
    ? Math.max(..._collectedNotes.map((n) => n.startMs + n.durationMs)) + 500
    : 0;

  console.log(`[StaffReadMode] ${_collectedNotes.length} note(s) collectée(s), durée estimée=${durationMs.toFixed(0)}ms`);

  return durationMs;
}

/**
 * Avance le curseur OSMD si le temps de lecture a dépassé
 * la position de la prochaine note du curseur.
 * Appelé à chaque frame par la game loop (via main.ts).
 *
 * @param currentTimeMs - Temps de lecture courant en ms (depuis le scheduler)
 */
export function updateStaffReadMode(currentTimeMs: number): void {
  if (!_ready || !_cursor || !_osmd) return;
  if (_cursor.Iterator.EndReached) return;

  // On avance le curseur tant que le temps courant dépasse la position
  // de la prochaine entrée de voix
  while (
    !_cursor.Iterator.EndReached &&
    _cursorCurrentMs() <= currentTimeMs
  ) {
    _cursor.next();
  }
}

/**
 * Colorie un GraphicalNote en vert (hit) ou rouge (miss).
 * Exposé pour être appelé par validator.ts à l'étape 7.
 * Ne colorie qu'une seule fois chaque note (premier résultat = définitif).
 *
 * @param noteId  - NoteID MIDI de la note à colorier
 * @param startMs - Temps de début attendu (pour cibler la bonne occurrence)
 * @param result  - 'hit' (vert) ou 'miss' (rouge)
 */
export function colorGraphicalNote(
  noteId:  number,
  startMs: number,
  result:  'hit' | 'miss',
): void {
  if (!_ready) return;

  // On cherche la note non encore coloriée la plus proche du startMs attendu
  const TOLERANCE_MS = 200;

  const target = _collectedNotes.find(
    (cn) =>
      !cn.colored &&
      cn.noteId === noteId &&
      Math.abs(cn.startMs - startMs) <= TOLERANCE_MS,
  );

  if (!target) return;

  const color = result === 'hit' ? '#22c55e' : '#ef4444';
  _applyColorToGn(target.gn, color);
  target.colored = true;
}

/**
 * Retourne la liste des notes collectées (lecture seule).
 * Utile pour validator.ts afin de connaître les notes attendues.
 */
export function getCollectedNotes(): ReadonlyArray<{
  noteId:     number;
  startMs:    number;
  durationMs: number;
}> {
  return _collectedNotes.map(({ noteId, startMs, durationMs }) => ({
    noteId,
    startMs,
    durationMs,
  }));
}

/**
 * Notes au format ParsedNote pour le scheduler / piano roll (Mode Lecture MXL).
 * À appeler après initStaffReadMode() une fois la collecte terminée.
 */
export function getStaffReadModeParsedNotes(): ParsedNote[] {
  return _collectedNotes.map((cn) => ({
    noteId:     cn.noteId,
    startMs:    cn.startMs,
    durationMs: cn.durationMs,
  }));
}

/**
 * Remet le curseur au début et réinitialise les colorations.
 * Appelé par les contrôles de lecture (bouton Recommencer).
 */
export function resetStaffReadMode(): void {
  if (!_ready || !_cursor) return;

  _cursor.reset();
  _cursor.show();

  // Réinitialisation visuelle : toutes les notes repassent en noir
  _collectedNotes.forEach((cn) => {
    if (cn.colored) {
      _applyColorToGn(cn.gn, 'black');
      cn.colored = false;
    }
  });

  console.log('[StaffReadMode] Reset curseur + couleurs');
}

/**
 * Détruit l'instance OSMD et nettoie le conteneur.
 * Appelé au retour au menu ou au changement de mode.
 */
export function disposeStaffReadMode(): void {
  _disposeOsmd();
  console.log('[StaffReadMode] Disposé');
}

// ─────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────

/**
 * Parcourt le MeasureList d'OSMD après rendu et collecte tous les
 * GraphicalNotes avec leur pitch MIDI et leur temps de début.
 *
 * Structure OSMD (validée par le PoC Étape 0) :
 * GraphicSheet.MeasureList
 *   → staffMeasures[]
 *     → measure
 *       → staffEntries[]
 *         → graphicalVoiceEntries[]
 *           → notes[] (GraphicalNote)
 */
function _collectGraphicalNotes(): void {
  _collectedNotes = [];

  if (!_osmd) return;

  const measureList = (_osmd as any).GraphicSheet?.MeasureList;
  if (!measureList) {
    console.warn('[StaffReadMode] GraphicSheet.MeasureList introuvable');
    return;
  }

  for (const staffMeasures of measureList) {
    for (const measure of staffMeasures) {
      if (!measure) continue;

      for (const staffEntry of measure.staffEntries ?? []) {
        for (const gve of staffEntry.graphicalVoiceEntries ?? []) {
          for (const gn of gve.notes ?? []) {
            const src = gn.sourceNote;
            if (!src || src.isRest()) continue;
            if (src.IsGraceNote) continue;

            const noteId = _pitchToMidi(gn);
            if (noteId === null) continue;

            const startMs    = _fractionToMs(src.getAbsoluteTimestamp());
            let durationMs   = _fractionToMs(gn.graphicalNoteLength);
            if (!Number.isFinite(durationMs) || durationMs < 1) {
              durationMs = 50;
            }

            _collectedNotes.push({
              gn,
              noteId,
              startMs,
              durationMs,
              colored: false,
            });
          }
        }
      }
    }
  }

  // Tri chronologique (au cas où les mesures ne seraient pas dans l'ordre)
  _collectedNotes.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Applique une couleur SVG à un GraphicalNote.
 * Stratégie validée par le PoC : getSVGGElement() + querySelectorAll.
 */
function _applyColorToGn(gn: any, color: string): void {
  const svgG = gn.getSVGGElement?.();
  if (!svgG) {
    console.warn('[StaffReadMode] getSVGGElement() non disponible');
    return;
  }

  svgG.querySelectorAll('path, ellipse, use').forEach((el: Element) => {
    el.setAttribute('fill',   color);
    el.setAttribute('stroke', color);
  });
}

/**
 * Convertit le pitch d'un GraphicalNote en NoteID MIDI (0–127).
 * Utilise sourceNote.pitch disponible dans OSMD.
 *
 * Formule MIDI : noteId = (octave + 1) × 12 + demitonsDuStep
 *
 * @returns NoteID MIDI ou null si le pitch n'est pas lisible
 */
function _pitchToMidi(gn: any): number | null {
  const pitch = gn.sourceNote?.pitch;
  if (!pitch) return null;

  // OSMD expose pitch.fundamentalNote (0=C, 1=D, ...) et pitch.octave
  // ainsi que pitch.halfTone qui donne directement le demi-ton depuis C0
  // On préfère halfTone s'il est disponible (plus fiable)
  if (typeof pitch.halfTone === 'number') {
    // halfTone dans OSMD = demi-tons depuis C0, MIDI C-1 = 0
    // MIDI = halfTone + 12 (décalage d'une octave entre OSMD et MIDI standard)
    return pitch.halfTone + 12;
  }

  // Fallback manuel
  const STEP_TO_SEMITONE: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };

  const step   = pitch.step ?? pitch.fundamentalNote;
  const octave = pitch.octave ?? 4;
  const alter  = pitch.alter ?? 0; // dièse (+1) ou bémol (-1)

  if (typeof step !== 'string' || !(step in STEP_TO_SEMITONE)) return null;

  return (octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter;
}

/**
 * Convertit une durée ou position musicale OSMD (Fraction) en millisecondes
 * via SheetPlaybackSetting — tient compte du BPM réel du fichier.
 */
function _fractionToMs(fraction: { RealValue: number } | null | undefined): number {
  if (!_osmd || !fraction) return 0;
  const playback = _osmd.Sheet?.SheetPlaybackSetting;
  if (!playback || typeof playback.getDurationInMilliseconds !== 'function') {
    const qn = (fraction as { RealValue?: number }).RealValue ?? 0;
    const bpm =
      _osmd.Sheet?.SheetPlaybackSetting?.BeatsPerMinute ??
      _osmd.Sheet?.DefaultStartTempoInBpm ??
      120;
    return (qn / bpm) * 60_000;
  }
  return playback.getDurationInMilliseconds(fraction as any);
}

/**
 * Retourne la position courante du curseur OSMD en millisecondes.
 */
function _cursorCurrentMs(): number {
  if (!_cursor || !_osmd) return 0;

  const ts = _cursor.Iterator.CurrentSourceTimestamp;
  return _fractionToMs(ts);
}

/**
 * Détruit l'instance OSMD proprement.
 */
function _disposeOsmd(): void {
  if (_cursor) {
    _cursor.hide();
    _cursor = null;
  }
  if (_container) {
    _container.innerHTML = '';
  }
  _osmd           = null;
  _collectedNotes = [];
  _ready          = false;
}

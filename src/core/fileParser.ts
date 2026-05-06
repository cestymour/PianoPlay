/* ================================================================
   src/core/fileParser.ts
   Parsing des fichiers .mid — MidiPlayerJS
   Gestion multi-pistes + sélection de piste
================================================================ */

import MidiPlayer from 'midi-player-js';

// ─────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────

/** Représente une note parsée, prête à être consommée par le piano roll */
export interface ParsedNote {
  noteId:     number;  // 0–127 (MIDI note number)
  startMs:    number;  // Temps de début en millisecondes
  durationMs: number;  // Durée de la note en millisecondes
}

/** Représente une piste MIDI disponible dans le fichier */
export interface MidiTrack {
  index: number;   // Index de la piste dans le fichier
  name:  string;   // Nom de la piste (ou "Piste N" si absent)
  notes: number;   // Nombre de notes (pour aider l'utilisateur à choisir)
}

/** Résultat complet du parsing d'un fichier .mid */
export interface ParsedMidiFile {
  tracks:      MidiTrack[];   // Liste de toutes les pistes disponibles
  durationMs:  number;        // Durée totale du morceau en ms
  bpm:         number;        // Tempo détecté (ou DEFAULT_BPM si absent)
}

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

/** Données brutes indexées par piste : noteId → liste de {startMs, durationMs} */
type RawNoteMap = Map<number, { startMs: number; durationMs: number }[]>;

let _player:       MidiPlayer.Player | null = null;
let _parsedTracks: Map<number, ParsedNote[]> = new Map(); // index piste → notes parsées
let _tracksMeta:   MidiTrack[] = [];
let _durationMs    = 0;
let _bpm           = 120;

// ─────────────────────────────────────────────
// API publique — Parsing
// ─────────────────────────────────────────────

/**
 * Parse un fichier .mid à partir d'un ArrayBuffer.
 * Retourne les métadonnées (pistes, durée, bpm).
 * Les notes de chaque piste sont stockées en interne.
 *
 * @param buffer - Contenu binaire du fichier .mid
 * @returns Métadonnées du fichier parsé
 */
export function parseMidiFile(buffer: ArrayBuffer): ParsedMidiFile {
  _reset();

  const player = new MidiPlayer.Player();
  _player = player;

  // Chargement du buffer dans MidiPlayerJS
  player.loadArrayBuffer(buffer);

  // Récupération du tempo si disponible
  // MidiPlayerJS expose le BPM après chargement
  _bpm = (player as any).tempo ?? 120;

  // On va parcourir les événements de toutes les pistes
  // MidiPlayerJS stocke les events dans player.events (tableau par piste)
  const rawEvents: MidiPlayer.Event[][] = (player as any).events ?? [];

  // Calcul du nombre de ticks par beat (PPQN)
  const ppqn: number = (player as any).division ?? 480;

  // Map temporaire : piste → (noteId → {startTick})
  // Utilisée pour calculer la durée (note_on → note_off correspondant)
  const openNotes: Map<number, Map<number, number>> = new Map();
  // Map des notes parsées brutes par piste
  const rawByTrack: Map<number, RawNoteMap> = new Map();

  rawEvents.forEach((trackEvents, trackIndex) => {
    openNotes.set(trackIndex, new Map());
    rawByTrack.set(trackIndex, new Map());

    let trackName = `Piste ${trackIndex + 1}`;

    trackEvents.forEach((evt) => {
      // Récupération du nom de piste via l'événement Track Name
      if (evt.name === 'Track Name' && evt.string) {
        trackName = evt.string;
      }

      const tick: number = evt.tick ?? 0;

      if (evt.name === 'Note on' && evt.noteNumber !== undefined && (evt.velocity ?? 0) > 0) {
        // Note on : on mémorise le tick de début
        openNotes.get(trackIndex)!.set(evt.noteNumber, tick);
      }

      if (
        evt.name === 'Note off' ||
        (evt.name === 'Note on' && (evt.velocity ?? 0) === 0)
      ) {
        // Note off : on calcule la durée
        if (evt.noteNumber === undefined) return;

        const startTick = openNotes.get(trackIndex)?.get(evt.noteNumber);
        if (startTick === undefined) return;

        openNotes.get(trackIndex)!.delete(evt.noteNumber);

        const startMs    = _ticksToMs(startTick, _bpm, ppqn);
        const durationMs = _ticksToMs(tick - startTick, _bpm, ppqn);

        const rawMap = rawByTrack.get(trackIndex)!;
        if (!rawMap.has(evt.noteNumber)) rawMap.set(evt.noteNumber, []);
        rawMap.get(evt.noteNumber)!.push({ startMs, durationMs });
      }
    });

    // Construction des ParsedNote[] pour cette piste
    const notes: ParsedNote[] = [];
    rawByTrack.get(trackIndex)!.forEach((instances, noteId) => {
      instances.forEach(({ startMs, durationMs }) => {
        notes.push({ noteId, startMs, durationMs });
      });
    });

    // Tri chronologique
    notes.sort((a, b) => a.startMs - b.startMs);

    _parsedTracks.set(trackIndex, notes);

    // Métadonnées de la piste
    _tracksMeta.push({
      index: trackIndex,
      name:  trackName,
      notes: notes.length,
    });
  });

  // Durée totale = fin de la dernière note de toutes les pistes
  _parsedTracks.forEach((notes) => {
    notes.forEach((n) => {
      const end = n.startMs + n.durationMs;
      if (end > _durationMs) _durationMs = end;
    });
  });

  console.log(`[FileParser] Parsé : ${_tracksMeta.length} piste(s), durée=${_durationMs.toFixed(0)}ms, bpm=${_bpm}`);

  return {
    tracks:     _tracksMeta,
    durationMs: _durationMs,
    bpm:        _bpm,
  };
}

/**
 * Retourne les notes parsées d'une piste spécifique.
 * À appeler après parseMidiFile().
 *
 * @param trackIndex - Index de la piste (voir MidiTrack.index)
 * @returns Tableau de ParsedNote trié chronologiquement
 */
export function getNotesForTrack(trackIndex: number): ParsedNote[] {
  return _parsedTracks.get(trackIndex) ?? [];
}

/**
 * Filtre les pistes ayant au moins une note (exclut les pistes vides
 * comme les pistes de tempo ou de métadonnées).
 */
export function getPlayableTracks(): MidiTrack[] {
  return _tracksMeta.filter(t => t.notes > 0);
}

// ─────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────

/**
 * Convertit un nombre de ticks MIDI en millisecondes.
 *
 * @param ticks - Nombre de ticks à convertir
 * @param bpm   - Tempo en beats par minute
 * @param ppqn  - Pulses Per Quarter Note (résolution du fichier MIDI)
 */
function _ticksToMs(ticks: number, bpm: number, ppqn: number): number {
  // ms = (ticks / ppqn) × (60 000 / bpm)
  return (ticks / ppqn) * (60_000 / bpm);
}

/**
 * Réinitialise l'état interne du parser.
 */
function _reset(): void {
  _player       = null;
  _parsedTracks = new Map();
  _tracksMeta   = [];
  _durationMs   = 0;
  _bpm          = 120;
}

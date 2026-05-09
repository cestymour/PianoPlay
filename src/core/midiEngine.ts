/* ================================================================
   src\core\midiEngine.ts
================================================================ */

import { WebMidi, Input, NoteMessageEvent } from "webmidi";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface MidiNote {
  noteId: number;       // 0–127 (MIDI standard)
  velocity: number;     // 0–127
  timestamp: number;    // ms depuis l'origine WebMidi
  name: string;         // ex: "C4", "F#3"
}

export type NoteOnCallback  = (note: MidiNote) => void;
export type NoteOffCallback = (note: MidiNote) => void;

// ─────────────────────────────────────────────
// État interne du module
// ─────────────────────────────────────────────

let _activeInput: Input | null = null;
let _onNoteOn:  NoteOnCallback  | null = null;
let _onNoteOff: NoteOffCallback | null = null;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Convertit un événement WebMidi en MidiNote normalisé.
 */
function toMidiNote(e: NoteMessageEvent): MidiNote {
  return {
    noteId:    e.note.number,
    velocity:  e.note.attack !== undefined ? Math.round(e.note.attack * 127) : 0,
    timestamp: e.timestamp,
    name:      e.note.identifier, // ex: "C4"
  };
}

/**
 * Attache les listeners note_on / note_off sur un Input donné.
 */
function bindInput(input: Input): void {
  // Nettoyage préventif si on rebind un nouvel input
  input.removeListener();

  input.addListener("noteon", (e: NoteMessageEvent) => {
    const note = toMidiNote(e);
    console.log(`[MIDI] note_on  → ${note.name} (id=${note.noteId}, vel=${note.velocity})`);
    _onNoteOn?.(note);
  });

  input.addListener("noteoff", (e: NoteMessageEvent) => {
    const note = toMidiNote(e);
    console.log(`[MIDI] note_off → ${note.name} (id=${note.noteId})`);
    _onNoteOff?.(note);
  });

  console.log(`[MIDI] Clavier connecté : "${input.name}"`);
}

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Initialise WebMidi et détecte automatiquement le premier clavier disponible.
 * Gère les connexions / déconnexions à chaud.
 *
 * @param onNoteOn  - Callback appelé à chaque note_on
 * @param onNoteOff - Callback appelé à chaque note_off
 */
export async function initMidi(
  onNoteOn:  NoteOnCallback,
  onNoteOff: NoteOffCallback
): Promise<void> {
  _onNoteOn  = onNoteOn;
  _onNoteOff = onNoteOff;

  try {
    // sysex: false → pas besoin de messages système, réduit les permissions
    await WebMidi.enable({ sysex: false });
    console.log("[MIDI] WebMidi activé.");
  } catch (err) {
    console.error("[MIDI] Impossible d'activer WebMidi :", err);
    return;
  }

  // ── Connexion initiale ──────────────────────
  if (WebMidi.inputs.length > 0) {
    _activeInput = WebMidi.inputs[0];
    bindInput(_activeInput);
  } else {
    console.warn("[MIDI] Aucun clavier détecté au démarrage. En attente...");
  }

  // ── Hot-plug : nouveau périphérique branché ─
  WebMidi.addListener("connected", (e) => {
    if (e.port.type !== "input") return;

    // On ne rebind que si on n'a pas déjà un clavier actif
    if (_activeInput === null) {
      const newInput = WebMidi.inputs.find((i) => i.id === e.port.id);
      if (newInput) {
        _activeInput = newInput;
        bindInput(_activeInput);
      }
    } else {
      console.log(`[MIDI] Périphérique supplémentaire détecté (ignoré) : "${e.port.name}"`);
    }
  });

  // ── Hot-unplug : périphérique débranché ─────
  WebMidi.addListener("disconnected", (e) => {
    if (_activeInput && e.port.id === _activeInput.id) {
      console.warn(`[MIDI] Clavier déconnecté : "${e.port.name}". En attente d'un nouveau clavier...`);
      _activeInput = null;

      // Si un autre input est déjà présent, on bascule dessus
      if (WebMidi.inputs.length > 0) {
        _activeInput = WebMidi.inputs[0];
        bindInput(_activeInput);
      }
    }
  });
}

/**
 * Retourne le nom du clavier actuellement connecté, ou null.
 */
export function getActiveInputName(): string | null {
  return _activeInput?.name ?? null;
}

/**
 * Retourne true si un clavier est actuellement connecté et actif.
 */
export function isMidiConnected(): boolean {
  return _activeInput !== null;
}

/**
 * Libère tous les listeners et désactive WebMidi proprement.
 */
export async function disposeMidi(): Promise<void> {
  _activeInput?.removeListener();
  _activeInput = null;
  await WebMidi.disable();
  console.log("[MIDI] WebMidi désactivé.");
}

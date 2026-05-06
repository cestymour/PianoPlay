/* ================================================================
   src/types/midi-player-js.d.ts
   Déclaration de types minimale pour midi-player-js
   (pas de @types officiel disponible sur npm)
================================================================ */

declare module 'midi-player-js' {

  export interface Event {
    name:       string;
    tick:       number;
    noteNumber?: number;
    velocity?:  number;
    string?:    string;   // Pour les événements Track Name, etc.
  }

  export class Player {
    constructor();

    /** Charge un fichier MIDI depuis un ArrayBuffer */
    loadArrayBuffer(buffer: ArrayBuffer): void;

    /** Tempo détecté après chargement (BPM) */
    tempo: number;

    /** Résolution MIDI (pulses per quarter note) */
    division: number;

    /** Événements indexés par piste, disponibles après loadArrayBuffer() */
    events: Event[][];
  }
}

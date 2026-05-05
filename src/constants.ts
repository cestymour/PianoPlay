/* ================================================================
   src\constants.ts
================================================================ */

// ── Timing ──
export const CHORD_DETECTION_WINDOW_MS = 30;   // Fenêtre de regroupement des notes simultanées
export const VALIDATION_TOLERANCE_MS   = 150;  // Fenêtre de tolérance pour la validation

// ── Piano Roll ──
export const SCROLL_SPEED_PX_PER_SEC  = 200;   // Vitesse de défilement des notes (px/s)
export const NOTE_HEIGHT_PX           = 20;    // Hauteur d'un NoteBlock
export const NOTE_MIN_MIDI            = 21;    // La0 (A0)
export const NOTE_MAX_MIDI            = 108;   // Do8 (C8)

// ── Couleurs ──
export const COLOR_NOTE_DEFAULT       = 0x4a90d9; // Bleu
export const COLOR_NOTE_HIT           = 0x22c55e; // Vert
export const COLOR_NOTE_MISS          = 0xef4444; // Rouge
export const COLOR_KEY_ACTIVE         = 0x4a90d9; // Bleu (touche enfoncée)
export const COLOR_KEY_WHITE          = 0xffffff;
export const COLOR_KEY_BLACK          = 0x1a1a1a;

// ── Métronome ──
export const DEFAULT_BPM              = 120;

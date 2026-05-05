/* ================================================================
   src/constants.ts
================================================================ */

// ── Timing ──
export const CHORD_DETECTION_WINDOW_MS = 30;
export const VALIDATION_TOLERANCE_MS   = 150;

// ── Piano Roll ──
export const SCROLL_SPEED_PX_PER_SEC  = 200;
export const NOTE_HEIGHT_PX           = 20;
export const NOTE_MIN_MIDI            = 21;   // A0 — clavier 88 touches complet
export const NOTE_MAX_MIDI            = 108;  // C8

// ── Clavier visuel ──
// Plage affichée par défaut : 5 octaves (C3 → C8, MIDI 48 → 108)
// Passer NOTE_MIN_MIDI / NOTE_MAX_MIDI pour afficher les 88 touches
export const KEYBOARD_MIN_MIDI        = 48;   // C3
export const KEYBOARD_MAX_MIDI        = 108;  // C8

// ── Couleurs ──
export const COLOR_NOTE_DEFAULT       = 0x4a90d9;
export const COLOR_NOTE_HIT           = 0x22c55e;
export const COLOR_NOTE_MISS          = 0xef4444;
export const COLOR_KEY_ACTIVE         = 0x4a90d9;
export const COLOR_KEY_WHITE          = 0xffffff;
export const COLOR_KEY_BLACK          = 0x1a1a1a;

// ── Métronome ──
export const DEFAULT_BPM              = 120;

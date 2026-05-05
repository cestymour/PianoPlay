/* ================================================================
   src/main.ts
================================================================ */

import './style.css';
import { initMidi, isMidiConnected, getActiveInputName } from './core/midiEngine';
import { handleNoteOn, handleNoteOff, onChordChange } from './core/chordDetector';
import { initRenderer } from './gfx/renderer';
import { initKeyboardViz, keyOn, keyOff, allKeysOff } from './gfx/keyboardViz';
import { initStaffFreeMode, renderChord, clearStaff, disposeStaffFreeMode } from './notation/staffFreeMode';
import type { MidiNote } from './core/midiEngine';

// ── Éléments DOM ──────────────────────────────────────────────────────────────
const overlayMenu   = document.getElementById('overlay-menu')   as HTMLDivElement;
const gameView      = document.getElementById('game-view')      as HTMLDivElement;
const btnFreeMode   = document.getElementById('btn-free-mode')  as HTMLButtonElement;
const btnLoadFile   = document.getElementById('btn-load-file')  as HTMLButtonElement;
const btnQuit       = document.getElementById('btn-quit')       as HTMLButtonElement;
const midiDot       = document.getElementById('midi-dot')       as HTMLSpanElement;
const midiLabel     = document.getElementById('midi-label')     as HTMLSpanElement;
const zoneStaff     = document.getElementById('zone-staff')     as HTMLDivElement;
const canvasKeyboard = document.getElementById('canvas-keyboard') as HTMLCanvasElement;

// ── État de l'app ─────────────────────────────────────────────────────────────
let _pixiKeyboardReady = false;

// ── Indicateur MIDI ───────────────────────────────────────────────────────────

function updateMidiStatusUI(connected: boolean, name: string | null): void {
  if (connected) {
    midiDot.className     = 'dot dot--green';
    midiLabel.textContent = `Clavier : ${name}`;
  } else {
    midiDot.className     = 'dot dot--red';
    midiLabel.textContent = 'Aucun clavier détecté';
  }
}

setInterval(() => {
  updateMidiStatusUI(isMidiConnected(), getActiveInputName());
}, 1000);

// ── Initialisation MIDI ───────────────────────────────────────────────────────

initMidi(
  (note: MidiNote) => {
    handleNoteOn(note);
    if (_pixiKeyboardReady) keyOn(note.noteId);
    updateMidiStatusUI(isMidiConnected(), getActiveInputName());
  },
  (note: MidiNote) => {
    handleNoteOff(note);
    if (_pixiKeyboardReady) keyOff(note.noteId);
  }
);

// ChordDetector → portée VexFlow (Mode Libre uniquement)
onChordChange((activeNotes) => {
  renderChord(activeNotes);
});

// ── Initialisation PixiJS (clavier visuel) ────────────────────────────────────

async function initGameView(): Promise<void> {
  if (_pixiKeyboardReady) return; // Déjà initialisé

  const keyboardZone   = document.getElementById('zone-keyboard') as HTMLDivElement;
  const keyboardWidth  = keyboardZone.clientWidth;
  const keyboardHeight = keyboardZone.clientHeight;

  const appKeyboard = await initRenderer(canvasKeyboard, keyboardWidth, keyboardHeight);
  initKeyboardViz(appKeyboard);

  _pixiKeyboardReady = true;
  console.log('[main] Vue jeu initialisée');
}

// ── Routing ───────────────────────────────────────────────────────────────────

function showMenu(): void {
  overlayMenu.classList.remove('hidden');
  gameView.classList.add('hidden');
  allKeysOff();
  clearStaff();
}

async function showGame(mode: 'free' | 'read'): Promise<void> {
  overlayMenu.classList.add('hidden');
  gameView.classList.remove('hidden');

  // Init PixiJS au premier passage (lazy init)
  await initGameView();

  if (mode === 'free') {
    // Zone portée visible + VexFlow
    zoneStaff.style.display = '';
    initStaffFreeMode(zoneStaff);
    renderChord([]); // Portée vide au démarrage
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

btnFreeMode.addEventListener('click', () => {
  console.log('[main] Mode Libre sélectionné');
  showGame('free');
});

btnLoadFile.addEventListener('click', () => {
  console.log('[main] Sélection de morceau (à implémenter)');
  // TODO étape 5/6
});

btnQuit.addEventListener('click', () => {
  console.log('[main] Retour au menu');
  disposeStaffFreeMode();
  showMenu();
});

// ── Démarrage ─────────────────────────────────────────────────────────────────

showMenu();
console.log('[main] PianoPlay initialisé');

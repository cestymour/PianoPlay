/* ================================================================
   src\main.ts
================================================================ */

import './style.css';
import { initMidi, isMidiConnected, getActiveInputName } from './core/midiEngine';
import type { MidiNote } from './core/midiEngine';

// ── Éléments DOM ──
const overlayMenu = document.getElementById('overlay-menu') as HTMLDivElement;
const gameView    = document.getElementById('game-view')    as HTMLDivElement;
const btnFreeMode = document.getElementById('btn-free-mode') as HTMLButtonElement;
const btnLoadFile = document.getElementById('btn-load-file') as HTMLButtonElement;
const btnQuit     = document.getElementById('btn-quit')      as HTMLButtonElement;
const midiDot     = document.getElementById('midi-dot')      as HTMLSpanElement;
const midiLabel   = document.getElementById('midi-label')    as HTMLSpanElement;

// ── Indicateur MIDI ──────────────────────────────────────────────────────────

/**
 * Met à jour la pastille et le label de statut MIDI dans le menu.
 */
function updateMidiStatusUI(connected: boolean, name: string | null): void {
  if (connected) {
    midiDot.className   = 'dot dot--green';
    midiLabel.textContent = `Clavier : ${name}`;
  } else {
    midiDot.className   = 'dot dot--red';
    midiLabel.textContent = 'Aucun clavier détecté';
  }
}

// Polling léger : rafraîchit l'indicateur toutes les secondes
setInterval(() => {
  updateMidiStatusUI(isMidiConnected(), getActiveInputName());
}, 1000);

// ── Initialisation MIDI ──────────────────────────────────────────────────────

initMidi(
  (note: MidiNote) => {
    // note_on → sera branché sur chordDetector + pianoRoll à l'étape 3
    console.log(`[main] note_on  → ${note.name} (id=${note.noteId}, vel=${note.velocity})`);
    // Mise à jour immédiate de l'indicateur (pas d'attente du polling)
    updateMidiStatusUI(isMidiConnected(), getActiveInputName());
  },
  (note: MidiNote) => {
    // note_off → idem
    console.log(`[main] note_off → ${note.name} (id=${note.noteId})`);
  }
);

// ── Routing basique ──────────────────────────────────────────────────────────

function showMenu(): void {
  overlayMenu.classList.remove('hidden');
  gameView.classList.add('hidden');
}

function showGame(): void {
  overlayMenu.classList.add('hidden');
  gameView.classList.remove('hidden');
}

// ── Listeners ────────────────────────────────────────────────────────────────

btnFreeMode.addEventListener('click', () => {
  console.log('[main] Mode Libre sélectionné');
  showGame();
});

btnLoadFile.addEventListener('click', () => {
  console.log('[main] Sélection de morceau (à implémenter)');
  // TODO étape 5/6 : ouvrir le sélecteur de fichier
});

btnQuit.addEventListener('click', () => {
  console.log('[main] Retour au menu');
  showMenu();
});

// ── Démarrage ────────────────────────────────────────────────────────────────

showMenu();
console.log('[main] PianoPlay initialisé');

/* ================================================================
   src/main.ts
================================================================ */

import './style.css';
import { initMidi, isMidiConnected, getActiveInputName } from './core/midiEngine';
import { handleNoteOn, handleNoteOff, onChordChange } from './core/chordDetector';
import { initRenderer } from './gfx/renderer';
import { initKeyboardViz, keyOn, keyOff, allKeysOff } from './gfx/keyboardViz';
import { initStaffFreeMode, renderChord, clearStaff, disposeStaffFreeMode } from './notation/staffFreeMode';
import {
  initPianoRoll,
  noteOnPianoRoll,
  noteOffPianoRoll,
  updatePianoRoll,
  clearPianoRoll,
  setPianoRollMode,
} from './gfx/pianoRoll';
import { initKeyboardDebug } from './core/keyboardDebug';
import { registerUpdateCallback, startGameLoop, pauseGameLoop, disposeGameLoop } from './core/gameLoop';
import { parseMidiFile, getNotesForTrack, getPlayableTracks } from './core/fileParser';
import type { MidiTrack } from './core/fileParser';
import {
  initScheduler,
  startScheduler,
  pauseScheduler,
  stopScheduler,
  updateScheduler,
} from './core/readModeScheduler';
import type { MidiNote } from './core/midiEngine';

// ─────────────────────────────────────────────
// Fichiers de démo embarqués
// ─────────────────────────────────────────────

/** Liste des morceaux de démo disponibles sans import de fichier */
const DEMO_FILES: { label: string; path: string }[] = [
  { label: 'Démo 1', path: '/songs/minuet.mid' },
  { label: 'Démo 2', path: '/songs/elise.mid' },
  { label: 'Démo 3', path: '/songs/bride.mid' },
];

// ── Éléments DOM ──────────────────────────────────────────────────────────────
const overlayMenu     = document.getElementById('overlay-menu')     as HTMLDivElement;
const gameView        = document.getElementById('game-view')        as HTMLDivElement;
const btnFreeMode     = document.getElementById('btn-free-mode')    as HTMLButtonElement;
const btnLoadFile     = document.getElementById('btn-load-file')    as HTMLButtonElement;
const btnQuit         = document.getElementById('btn-quit')         as HTMLButtonElement;
const btnPause        = document.getElementById('btn-pause')        as HTMLButtonElement;
const midiDot         = document.getElementById('midi-dot')         as HTMLSpanElement;
const midiLabel       = document.getElementById('midi-label')       as HTMLSpanElement;
const zoneStaff       = document.getElementById('zone-staff')       as HTMLDivElement;
const canvasKeyboard  = document.getElementById('canvas-keyboard')  as HTMLCanvasElement;
const canvasPianoRoll = document.getElementById('canvas-pianoroll') as HTMLCanvasElement;

// ── Éléments DOM injectés dynamiquement ───────────────────────────────────────

/** Conteneur du panneau de sélection de fichier/piste (injecté dans overlay-menu) */
let _filePickerPanel: HTMLDivElement | null = null;

/** Select de sélection de piste (injecté dynamiquement après parsing) */
let _trackSelect: HTMLSelectElement | null = null;

// ── État de l'app ─────────────────────────────────────────────────────────────
let _pixiReady       = false;
let _isPaused        = false;
let _pianoRollHeight = 0;

/** Index de la piste sélectionnée pour la lecture */
let _selectedTrackIndex = 0;

// ─────────────────────────────────────────────
// Indicateur MIDI
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Initialisation MIDI
// ─────────────────────────────────────────────

initMidi(
  (note: MidiNote) => {
    handleNoteOn(note);
    if (_pixiReady) {
      keyOn(note.noteId);
      noteOnPianoRoll(note.noteId);
    }
    updateMidiStatusUI(isMidiConnected(), getActiveInputName());
  },
  (note: MidiNote) => {
    handleNoteOff(note);
    if (_pixiReady) {
      keyOff(note.noteId);
      noteOffPianoRoll(note.noteId);
    }
  }
);

// ── Simulation clavier AZERTY (debug) ─────────────────────────────────────────
initKeyboardDebug(
  (note: MidiNote) => {
    handleNoteOn(note);
    if (_pixiReady) {
      keyOn(note.noteId);
      noteOnPianoRoll(note.noteId);
    }
  },
  (note: MidiNote) => {
    handleNoteOff(note);
    if (_pixiReady) {
      keyOff(note.noteId);
      noteOffPianoRoll(note.noteId);
    }
  }
);

// ChordDetector → portée VexFlow (Mode Libre uniquement)
onChordChange((activeNotes) => {
  renderChord(activeNotes);
});

// ─────────────────────────────────────────────
// Initialisation PixiJS (lazy, au premier passage en vue jeu)
// ─────────────────────────────────────────────

async function initGameView(): Promise<void> {
  if (_pixiReady) {
    startGameLoop();
    console.log('[main] Vue jeu réactivée');
    return;
  }

  // ── Canvas Clavier ──────────────────────────────────────────────────────────
  const keyboardZone   = document.getElementById('zone-keyboard') as HTMLDivElement;
  const keyboardWidth  = keyboardZone.clientWidth;
  const keyboardHeight = keyboardZone.clientHeight;

  const appKeyboard = await initRenderer(canvasKeyboard, keyboardWidth, keyboardHeight);
  initKeyboardViz(appKeyboard);

  // ── Canvas Piano Roll ───────────────────────────────────────────────────────
  const pianoRollZone = document.getElementById('zone-pianoroll') as HTMLDivElement;
  const pianoRollWidth  = pianoRollZone.clientWidth;
  _pianoRollHeight      = pianoRollZone.clientHeight;

  const appPianoRoll = await initRenderer(canvasPianoRoll, pianoRollWidth, _pianoRollHeight);
  initPianoRoll(appPianoRoll);

  // ── Game Loop ───────────────────────────────────────────────────────────────
  registerUpdateCallback(updatePianoRoll);
  registerUpdateCallback(updateScheduler);
  startGameLoop();

  _pixiReady = true;
  console.log('[main] Vue jeu initialisée');
}

// ─────────────────────────────────────────────
// Sélection de fichier / piste (overlay menu)
// ─────────────────────────────────────────────

/**
 * Construit le panneau de sélection de fichier et de piste
 * dans l'overlay menu. Appelé au clic sur "SÉLECTIONNER UN MORCEAU".
 */
function buildFilePickerPanel(): void {
  // Supprime le panneau précédent s'il existe
  _filePickerPanel?.remove();

  const panel = document.createElement('div');
  panel.id = 'file-picker-panel';

  // ── Section démos ──────────────────────────────────────────────────────────
  const demoTitle = document.createElement('p');
  demoTitle.textContent = 'Morceaux de démo :';
  panel.appendChild(demoTitle);

  const demoList = document.createElement('div');
  demoList.id = 'demo-list';

  DEMO_FILES.forEach(({ label, path }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className   = 'btn-demo';
    btn.addEventListener('click', () => loadMidiFromUrl(path));
    demoList.appendChild(btn);
  });

  panel.appendChild(demoList);

  // ── Section import fichier ────────────────────────────────────────────────
  const importTitle = document.createElement('p');
  importTitle.textContent = 'Ou importer un fichier .mid :';
  panel.appendChild(importTitle);

  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = '.mid,.midi';
  fileInput.id     = 'input-midi-file';
  fileInput.addEventListener('change', onMidiFileInputChange);
  panel.appendChild(fileInput);

  // ── Section sélection de piste (initialement masquée) ────────────────────
  const trackSection = document.createElement('div');
  trackSection.id = 'track-section';
  trackSection.style.display = 'none';

  const trackLabel = document.createElement('label');
  trackLabel.htmlFor     = 'track-select';
  trackLabel.textContent = 'Piste à jouer :';

  const trackSelect = document.createElement('select');
  trackSelect.id = 'track-select';
  trackSelect.addEventListener('change', () => {
    _selectedTrackIndex = parseInt(trackSelect.value, 10);
    console.log(`[main] Piste sélectionnée : ${_selectedTrackIndex}`);
  });

  _trackSelect = trackSelect;

  const btnPlay = document.createElement('button');
  btnPlay.id          = 'btn-start-read';
  btnPlay.textContent = '▶ Jouer';
  btnPlay.addEventListener('click', () => startReadMode());

  trackSection.appendChild(trackLabel);
  trackSection.appendChild(trackSelect);
  trackSection.appendChild(btnPlay);
  panel.appendChild(trackSection);

  overlayMenu.appendChild(panel);
  _filePickerPanel = panel;
}

/**
 * Charge un fichier .mid depuis une URL (fichiers de démo).
 */
async function loadMidiFromUrl(url: string): Promise<void> {
  try {
    console.log(`[main] Chargement démo : ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    onMidiBufferReady(buffer, url.split('/').pop() ?? url);
  } catch (err) {
    console.error('[main] Erreur chargement démo :', err);
    alert(`Impossible de charger le fichier : ${url}`);
  }
}

/**
 * Handler de l'input file — lit le fichier sélectionné par l'utilisateur.
 */
function onMidiFileInputChange(evt: Event): void {
  const input = evt.target as HTMLInputElement;
  const file  = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target?.result as ArrayBuffer;
    if (buffer) onMidiBufferReady(buffer, file.name);
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Appelé quand un buffer .mid est prêt (démo ou import).
 * Parse le fichier et affiche le sélecteur de piste.
 */
function onMidiBufferReady(buffer: ArrayBuffer, filename: string): void {
  console.log(`[main] Parsing : ${filename}`);

  const result = parseMidiFile(buffer);
  const playableTracks = getPlayableTracks();

  if (playableTracks.length === 0) {
    alert('Ce fichier MIDI ne contient aucune note jouable.');
    return;
  }

  // Sélection par défaut : première piste jouable
  _selectedTrackIndex = playableTracks[0].index;

  // Alimentation du select de piste
  _populateTrackSelect(playableTracks);

  // Affichage de la section piste
  const trackSection = document.getElementById('track-section');
  if (trackSection) trackSection.style.display = '';

  console.log(`[main] ${playableTracks.length} piste(s) jouable(s) détectée(s)`);
}

/**
 * Remplit le <select> avec les pistes jouables.
 */
function _populateTrackSelect(tracks: MidiTrack[]): void {
  if (!_trackSelect) return;

  _trackSelect.innerHTML = '';

  tracks.forEach((track) => {
    const opt = document.createElement('option');
    opt.value       = String(track.index);
    opt.textContent = `${track.name} (${track.notes} notes)`;
    _trackSelect!.appendChild(opt);
  });
}

// ─────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────

function showMenu(): void {
  overlayMenu.classList.remove('hidden');
  gameView.classList.add('hidden');
  allKeysOff();
  clearStaff();
  clearPianoRoll();
  stopScheduler();
  disposeStaffFreeMode();
  pauseGameLoop();
  _isPaused = false;
}


async function showGame(mode: 'free' | 'read'): Promise<void> {
  overlayMenu.classList.add('hidden');
  gameView.classList.remove('hidden');

  // Init PixiJS au premier passage (lazy init)
  await initGameView();

  if (mode === 'free') {
    setPianoRollMode('free');
    zoneStaff.style.display = '';
    initStaffFreeMode(zoneStaff);
    renderChord([]);
  }

  if (mode === 'read') {
    setPianoRollMode('read');
    // La portée est masquée en Mode Lecture MIDI (pas de .mxl)
    zoneStaff.style.display = 'none';
  }
}

/**
 * Lance le Mode Lecture avec la piste sélectionnée.
 */
async function startReadMode(): Promise<void> {
  const notes = getNotesForTrack(_selectedTrackIndex);

  if (notes.length === 0) {
    alert('Cette piste ne contient aucune note.');
    return;
  }

  await showGame('read');

  // Init du scheduler avec la hauteur réelle du piano roll
  initScheduler(notes, _pianoRollHeight, () => {
    console.log('[main] Morceau terminé');
    // TODO étape 8 : afficher l'écran de score
  });

  startScheduler();
  console.log(`[main] Mode Lecture démarré — piste ${_selectedTrackIndex}, ${notes.length} notes`);
}

// ─────────────────────────────────────────────
// Listeners boutons
// ─────────────────────────────────────────────

btnFreeMode.addEventListener('click', () => {
  console.log('[main] Mode Libre sélectionné');
  showGame('free');
});

btnLoadFile.addEventListener('click', () => {
  buildFilePickerPanel();
});

btnPause.addEventListener('click', () => {
  _isPaused = !_isPaused;
  if (_isPaused) {
    pauseScheduler();
    btnPause.textContent = '▶ Reprendre';
  } else {
    startScheduler();
    btnPause.textContent = '⏸ Pause';
  }
});

btnQuit.addEventListener('click', () => {
  console.log('[main] Retour au menu');
  disposeStaffFreeMode();
  showMenu();
});

// ─────────────────────────────────────────────
// Démarrage
// ─────────────────────────────────────────────

showMenu();
console.log('[main] PianoPlay initialisé');

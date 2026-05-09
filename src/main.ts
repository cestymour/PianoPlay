/* ================================================================
   src/main.ts
================================================================ */

import './style.css';
import { initMidi, isMidiConnected, getActiveInputName } from './core/midiEngine';
import { handleNoteOn, handleNoteOff, onChordChange } from './core/chordDetector';
import { initRenderer } from './gfx/renderer';
import { initKeyboardViz, keyOn, keyOff, allKeysOff } from './gfx/keyboardViz';
import {
  initStaffFreeMode,
  renderChord,
  clearStaff,
  disposeStaffFreeMode,
} from './notation/staffFreeMode';
import {
  initStaffReadMode,
  updateStaffReadMode,
  disposeStaffReadMode,
  resetStaffReadMode,
  getStaffReadModeParsedNotes,
} from './notation/staffReadMode';
import {
  initPianoRoll,
  noteOnPianoRoll,
  noteOffPianoRoll,
  updatePianoRoll,
  clearPianoRoll,
  setPianoRollMode,
} from './gfx/pianoRoll';
import { initKeyboardDebug } from './core/keyboardDebug';
import {
  registerUpdateCallback,
  startGameLoop,
  pauseGameLoop,
  disposeGameLoop,
} from './core/gameLoop';
import {
  parseMidiFile,
  parseMxlFile,
  detectFileType,
  getNotesForTrack,
  getPlayableTracks,
  ALL_TRACKS_INDEX,
} from './core/fileParser';
import type { MidiTrack, MusicFileType, ParsedMxlFile } from './core/fileParser';
import {
  initScheduler,
  startScheduler,
  pauseScheduler,
  stopScheduler,
  updateScheduler,
  getCurrentTimeMs,
} from './core/readModeScheduler';
import type { MidiNote } from './core/midiEngine';

// ─────────────────────────────────────────────
// Fichiers de démo embarqués
// ─────────────────────────────────────────────

/** Liste des morceaux de démo disponibles sans import de fichier */
const DEMO_FILES: { label: string; path: string }[] = [
  { label: 'Démo 1 (MIDI)',  path: '/songs/minuet.mid'  },
  { label: 'Démo 2 (MIDI)',  path: '/songs/elise.mid'   },
  { label: 'Démo 3 (MIDI)',  path: '/songs/bride.mid'   },
  { label: 'Démo 4 (MXL)',   path: '/songs/bride.mxl'   },
  { label: 'Démo 5 (MXL)',   path: '/songs/saez.mxl'    },
];

// ─────────────────────────────────────────────
// Éléments DOM
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// État de l'app
// ─────────────────────────────────────────────

let _pixiReady          = false;
let _isPaused           = false;
let _pianoRollHeight    = 0;
let _selectedTrackIndex = 0;

/**
 * Type du fichier chargé en cours.
 * Détermine le mode de lecture (piano roll seul vs piano roll + portée OSMD).
 */
let _loadedFileType: MusicFileType = 'unknown';

/** Buffer du fichier .mxl chargé, conservé pour initStaffReadMode() */
let _mxlBuffer: ParsedMxlFile | null = null;

/** Panels injectés dynamiquement */
let _filePickerPanel: HTMLDivElement | null  = null;
let _trackSelect:     HTMLSelectElement | null = null;

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
  },
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
  },
);

onChordChange((activeNotes) => {
  renderChord(activeNotes);
});

// ─────────────────────────────────────────────
// Initialisation PixiJS (lazy)
// ─────────────────────────────────────────────

async function initGameView(): Promise<void> {
  if (_pixiReady) {
    startGameLoop();
    return;
  }

  const keyboardZone   = document.getElementById('zone-keyboard') as HTMLDivElement;
  const appKeyboard    = await initRenderer(canvasKeyboard, keyboardZone.clientWidth, keyboardZone.clientHeight);
  initKeyboardViz(appKeyboard);

  const pianoRollZone  = document.getElementById('zone-pianoroll') as HTMLDivElement;
  const pianoRollWidth = pianoRollZone.clientWidth;
  _pianoRollHeight     = pianoRollZone.clientHeight;

  const appPianoRoll = await initRenderer(canvasPianoRoll, pianoRollWidth, _pianoRollHeight);
  initPianoRoll(appPianoRoll);

  registerUpdateCallback(updatePianoRoll);
  registerUpdateCallback(updateScheduler);

  // Callback de synchronisation curseur OSMD — branché une seule fois.
  // Il s'exécute à chaque frame mais est no-op si OSMD n'est pas actif.
  registerUpdateCallback(_syncOsmdCursor);

  startGameLoop();

  _pixiReady = true;
  console.log('[main] Vue jeu initialisée');
}

/**
 * Synchronise le curseur OSMD avec le temps courant du scheduler.
 * Enregistré comme callback de la game loop dans initGameView().
 * No-op si on n'est pas en Mode Lecture MXL.
 */
function _syncOsmdCursor(_deltaMs: number): void {
  if (_loadedFileType !== 'mxl') return;
  updateStaffReadMode(getCurrentTimeMs());
}

// ─────────────────────────────────────────────
// Sélection de fichier / piste
// ─────────────────────────────────────────────

/**
 * Construit le panneau de sélection de fichier et de piste
 * dans l'overlay menu. Appelé au clic sur "SÉLECTIONNER UN MORCEAU".
 */
function buildFilePickerPanel(): void {
  _filePickerPanel?.remove();

  const panel = document.createElement('div');
  panel.id = 'file-picker-panel';

  // ── Démos ──────────────────────────────────────────────────────
  const demoTitle = document.createElement('p');
  demoTitle.textContent = 'Morceaux de démo :';
  panel.appendChild(demoTitle);

  const demoList = document.createElement('div');
  demoList.id = 'demo-list';

  DEMO_FILES.forEach(({ label, path }) => {
    const btn       = document.createElement('button');
    btn.textContent = label;
    btn.className   = 'btn-demo';
    btn.addEventListener('click', () => loadFileFromUrl(path));
    demoList.appendChild(btn);
  });

  panel.appendChild(demoList);

  // ── Import fichier ─────────────────────────────────────────────
  const importTitle       = document.createElement('p');
  importTitle.textContent = 'Ou importer un fichier :';
  panel.appendChild(importTitle);

  const fileInput  = document.createElement('input');
  fileInput.type   = 'file';
  // Une seule boîte de dialogue pour .mid et .mxl/.xml
  fileInput.accept = '.mid,.midi,.mxl,.xml,.musicxml';
  fileInput.id     = 'input-music-file';
  fileInput.addEventListener('change', onFileInputChange);
  panel.appendChild(fileInput);

  // ── Sélection de piste (MIDI uniquement, masquée par défaut) ──
  const trackSection       = document.createElement('div');
  trackSection.id          = 'track-section';
  trackSection.style.display = 'none';

  const trackLabel         = document.createElement('label');
  trackLabel.htmlFor       = 'track-select';
  trackLabel.textContent   = 'Piste à jouer :';

  const trackSelect        = document.createElement('select');
  trackSelect.id           = 'track-select';
  trackSelect.addEventListener('change', () => {
    _selectedTrackIndex = parseInt(trackSelect.value, 10);
  });
  _trackSelect = trackSelect;

  const btnPlay            = document.createElement('button');
  btnPlay.id               = 'btn-start-read';
  btnPlay.textContent      = '▶ Jouer';
  btnPlay.addEventListener('click', () => startReadMode());

  trackSection.appendChild(trackLabel);
  trackSection.appendChild(trackSelect);
  trackSection.appendChild(btnPlay);
  panel.appendChild(trackSection);

  overlayMenu.appendChild(panel);
  _filePickerPanel = panel;
}

// ─────────────────────────────────────────────
// Chargement de fichier
// ─────────────────────────────────────────────

/**
 * Charge un fichier depuis une URL (démos).
 * Détecte automatiquement le type via l'extension.
 */
async function loadFileFromUrl(url: string): Promise<void> {
  try {
    console.log(`[main] Chargement : ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer   = await response.arrayBuffer();
    const filename = url.split('/').pop() ?? url;
    onBufferReady(buffer, filename);
  } catch (err) {
    console.error('[main] Erreur chargement :', err);
    alert(`Impossible de charger le fichier.`);
  }
}

/**
 * Handler de l'<input type="file"> unifié (.mid + .mxl).
 */
function onFileInputChange(evt: Event): void {
  const input = evt.target as HTMLInputElement;
  const file  = input.files?.[0];
  if (!file) return;

  const reader    = new FileReader();
  reader.onload   = (e) => {
    const buffer = e.target?.result as ArrayBuffer;
    if (buffer) onBufferReady(buffer, file.name);
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Point d'entrée unique après obtention du buffer.
 * Aiguille vers le parsing .mid ou .mxl selon le type détecté.
 */
function onBufferReady(buffer: ArrayBuffer, filename: string): void {
  const fileType = detectFileType(filename);

  if (fileType === 'unknown') {
    alert('Format non reconnu. Utilisez un fichier .mid ou .mxl.');
    return;
  }

  _loadedFileType = fileType;
  _mxlBuffer      = null;

  console.log(`[main] Fichier : ${filename} (type=${fileType})`);

  if (fileType === 'mid') {
    // ── Parsing MIDI ───────────────────────────────────────────
    const result         = parseMidiFile(buffer);
    const playableTracks = getPlayableTracks();

    if (playableTracks.length === 0) {
      alert('Ce fichier MIDI ne contient aucune note jouable.');
      return;
    }

    _selectedTrackIndex = ALL_TRACKS_INDEX;
    _populateTrackSelect(playableTracks);

    // Afficher le sélecteur de piste
    const trackSection = document.getElementById('track-section');
    if (trackSection) trackSection.style.display = '';

  } else {
    // ── Fichier MXL ────────────────────────────────────────────
    // Pas de sélection de piste pour .mxl — OSMD gère en interne
    _mxlBuffer = parseMxlFile(buffer, filename);

    // Masquer la section piste si elle était visible (changement de fichier)
    const trackSection = document.getElementById('track-section');
    if (trackSection) trackSection.style.display = 'none';

    // Bouton de lancement direct (sans sélection de piste)
    _showMxlPlayButton();
  }
}

/**
 * Affiche un bouton "▶ Jouer" direct pour les fichiers .mxl
 * (pas de sélection de piste nécessaire).
 */
function _showMxlPlayButton(): void {
  // Réutilise ou crée un bouton dédié MXL
  let btnMxlPlay = document.getElementById('btn-mxl-play') as HTMLButtonElement | null;

  if (!btnMxlPlay) {
    btnMxlPlay            = document.createElement('button');
    btnMxlPlay.id         = 'btn-mxl-play';
    btnMxlPlay.textContent = '▶ Jouer la partition';
    btnMxlPlay.addEventListener('click', () => startReadMode());
    _filePickerPanel?.appendChild(btnMxlPlay);
  }

  btnMxlPlay.style.display = '';
}

function _populateTrackSelect(tracks: MidiTrack[]): void {
  if (!_trackSelect) return;
  _trackSelect.innerHTML = '';

  const totalNotes = tracks.reduce((sum, track) => sum + track.notes, 0);
  const allTracksOption = document.createElement('option');
  allTracksOption.value = String(ALL_TRACKS_INDEX);
  allTracksOption.textContent = `Toutes les pistes (${totalNotes} notes)`;
  _trackSelect.appendChild(allTracksOption);

  tracks.forEach((track) => {
    const opt         = document.createElement('option');
    opt.value         = String(track.index);
    opt.textContent   = `${track.name} (${track.notes} notes)`;
    _trackSelect!.appendChild(opt);
  });

  _trackSelect.value = String(_selectedTrackIndex);
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
  disposeStaffReadMode();  // ← nettoyage OSMD au retour menu
  pauseGameLoop();

  _loadedFileType = 'unknown';
  _mxlBuffer      = null;
  _isPaused       = false;
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

    if (_loadedFileType === 'mxl') {
      // Mode Lecture MXL : portée OSMD visible
      zoneStaff.style.display = '';
    } else {
      // Mode Lecture MIDI : portée masquée
      zoneStaff.style.display = 'none';
    }
  }
}

/**
 * Lance le Mode Lecture avec la piste/fichier sélectionné(e).
 * Gère les deux cas : .mid (notes du fileParser) et .mxl (OSMD).
 */
async function startReadMode(): Promise<void> {
  await showGame('read');

  if (_loadedFileType === 'mid') {
    // ── Mode Lecture MIDI ───────────────────────────────────────
    const notes = getNotesForTrack(_selectedTrackIndex);

    if (notes.length === 0) {
      alert('Cette piste ne contient aucune note.');
      return;
    }

    initScheduler(notes, _pianoRollHeight, () => {
      console.log('[main] Morceau MIDI terminé');
      // TODO étape 8 : écran de score
    });

    startScheduler();
    console.log(`[main] Mode Lecture MIDI — piste ${_selectedTrackIndex}, ${notes.length} notes`);

  } else if (_loadedFileType === 'mxl' && _mxlBuffer) {
    // ── Mode Lecture MXL ────────────────────────────────────────
    // 1. Charger et rendre OSMD dans la zone portée
    const durationMs = await initStaffReadMode(
      zoneStaff,
      _mxlBuffer.buffer,
      _mxlBuffer.mimeType,
    );

    const mxlNotes = getStaffReadModeParsedNotes();
    if (mxlNotes.length === 0) {
      console.warn('[main] Aucune note OSMD pour le piano roll — scheduler vide');
    }

    // 2. Même pipeline que le MIDI : scheduler + piano roll, temps = getCurrentTimeMs()
    //    (curseur OSMD synchronisé dans _syncOsmdCursor).
    initScheduler(mxlNotes, _pianoRollHeight, () => {
      console.log('[main] Morceau MXL terminé');
      // TODO étape 8 : écran de score
    });

    startScheduler();

    console.log(
      `[main] Mode Lecture MXL — ${mxlNotes.length} note(s), durée estimée=${durationMs.toFixed(0)}ms`,
    );
  }
}

// ─────────────────────────────────────────────
// Listeners
// ─────────────────────────────────────────────

btnFreeMode.addEventListener('click', () => showGame('free'));

btnLoadFile.addEventListener('click', () => buildFilePickerPanel());

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
  disposeStaffFreeMode();
  showMenu();
});

// ─────────────────────────────────────────────
// Démarrage
// ─────────────────────────────────────────────

showMenu();
console.log('[main] PianoPlay initialisé');

# PianoPlay

Application web (PWA-friendly) type **« Piano Hero »** pour **tablette Android (Chrome)** : connexion d’un **clavier maître MIDI** (USB-C ou Bluetooth), visualisation des notes, **mode libre** avec portée temps réel (VexFlow), **mode lecture** avec fichiers **`.mid`** ou **`.mxl`** (piano roll PixiJS ; portée **OpenSheetMusicDisplay** pour le MusicXML).

Ce document décrit la **vision**, la **stack**, le **flux d’exécution**, et **chaque fichier du dépôt** avec son rôle, afin qu’une IA ou un humain sache **où modifier le code** pour une évolution donnée.

---

## 1. Objectifs produit (résumé)

| Mode | Portée (haut) | Piano roll | Clavier visuel (bas) | Audio |
|------|----------------|------------|----------------------|--------|
| **Libre** | VexFlow — accords temps réel (pas de défilement partition) | Blocs qui **montent** au `note_on` | Touches allumées au MIDI | Son **Tone.js** sur entrée MIDI |
| **Lecture `.mid`** | Masquée | Blocs qui **descendent** ; spawn synchronisé sur le temps | Idem | Son morceau + entrée clavier |
| **Lecture `.mxl`** | OSMD — curseur + partition | Idem (notes issues d’OSMD) | Idem | Idem |

**Contraintes cibles** : fluidité PixiJS (~60 FPS) ; portée VexFlow/OSMD **hors** charge critique de la boucle de jeu ; feedback OSMD en étape 7 via **SVG** (`fill`) sur les notes générées, sans injection DOM externe.

---

## 2. Stack technique

| Rôle | Technologie |
|------|-------------|
| Langage | **TypeScript** (ES modules) |
| Build / dev | **Vite** 8 |
| Rendu piano roll + clavier | **PixiJS** 8 (WebGL), canvas dédiés |
| MIDI entrant | **webmidi** (Web MIDI API) |
| Fichiers `.mid` | **midi-player-js** |
| Fichiers `.mxl` / MusicXML | **opensheetmusicdisplay** (OSMD) |
| Portée mode libre | **Vexflow** |
| Son (aperçu / morceau) | **Tone.js** (PolySynth + FM) |

Fichiers de démo MIDI/MXL : répertoire `songs/` (servis depuis la racine en dev via Vite).

---

## 3. Commandes et prérequis

- **Node.js** récent (compatible avec les `engines` implicites de Vite 8).
- Installer : `npm install`
- Développement : `npm run dev` — ouvre le serveur Vite ; **Chrome sur tablette** recommandé pour Web MIDI.
- Build production : `npm run build` (lance `tsc` puis `vite build`).
- Prévisualisation du build : `npm run preview`.

**Audio** : le navigateur impose un **geste utilisateur** avant `AudioContext` ; `installAudioUnlockOnFirstGesture()` (voir `src/audio/midiPianoPreview.ts`) écoute le premier `pointerdown` / `keydown` sur `document.body`.

**MIDI** : `WebMidi.enable()` peut nécessiter une interaction utilisateur selon le navigateur.

---

## 4. Schéma d’architecture logique

```
┌─────────────────────────────────────────────────────────────┐
│  index.html + style.css          UI statique (menu, zones)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  main.ts                        Routage, état global, DOM,    │
│                                 branchement modes libre/read  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   midiEngine.ts      chordDetector.ts      fileParser.ts
   keyboardDebug.ts   (accords)            (MID/MXL → données)
         │                    │                    │
         └──────────────┬─────┴────────────────────┘
                        ▼
                 gameLoop.ts ◄── callbacks frame (delta)
                        │
         ┌───────────────┼───────────────┬──────────────────┐
         ▼               ▼               ▼                  ▼
   pianoRoll.ts   keyboardViz.ts   readModeScheduler.ts   staffReadMode.ts
   (Pixi roll)     (Pixi clavier)   (temps lecture +      (OSMD curseur MXL)
                                     spawn + audio fichier)
         │                               │
         └───────────────┬───────────────┘
                         ▼
              staffFreeMode.ts (VexFlow, mode libre)
              midiPianoPreview.ts (Tone.js)
```

**Temps de lecture (mode morceau)** : `readModeScheduler.getCurrentTimeMs()` est la référence unique pour le piano roll, l’audio fichier, et la synchro curseur OSMD (MXL).

---

## 5. Découpage visuel de l’écran (CSS)

Défini dans `src/style.css` / `index.html` :

1. **`#zone-staff`** (~30 % hauteur) : portée VexFlow (libre) ou OSMD (lecture MXL).
2. **`#zone-pianoroll`** (~55 %) : canvas PixiJS `#canvas-pianoroll`.
3. **`#zone-keyboard`** (~15 %) : canvas PixiJS `#canvas-keyboard`.

Overlay menu : `#overlay-menu`. Vue jeu : `#game-view` avec `#game-controls` (Pause, Quitter).

---

## 6. Arborescence complète des fichiers et rôle de chaque fichier

Racine du dépôt **PianoPlay** (chemins relatifs à la racine du repo).

### 6.1 Entrée HTML et config projet

| Fichier | Rôle |
|---------|------|
| **`index.html`** | Shell de l’app : overlay menu, `game-view`, trois zones (staff / pianoroll / keyboard), boutons contrôle. Point d’entrée script : `/src/main.ts`. **Modifier** pour ajouter des boutons, métadonnées PWA, ou lier d’autres CSS. |
| **`package.json`** | Dépendances npm et scripts (`dev`, `build`, `preview`). **Modifier** pour ajouter une librairie ou changer le pipeline de build. |
| **`package-lock.json`** | Verrouillage des versions npm (ne pas éditer à la main). |
| **`tsconfig.json`** | Cible ES2020, `strict`, `noUnusedLocals`, `include: ["src"]`. **Modifier** pour assouplir les règles TS ou inclure d’autres dossiers. |
| **`.gitignore`** | Fichiers ignorés par Git (`node_modules`, `dist`, etc.). |

### 6.2 Assets publics et morceaux de démo

| Fichier / dossier | Rôle |
|-------------------|------|
| **`public/favicon.svg`**, **`public/icons.svg`** | Icônes / favicon servis tels quels par Vite. |
| **`songs/*.mid`**, **`songs/*.mxl`** | Morceaux de démo (chemins référencés dans `main.ts` → `DEMO_FILES`). **Ajouter** des fichiers ici pour enrichir les démos ; mettre à jour la liste dans `main.ts`. |

### 6.3 Point d’entrée et styles UI

| Fichier | Rôle |
|---------|------|
| **`src/main.ts`** | **Cœur applicatif** : init WebMidi + callbacks note on/off (clavier physique + debug clavier) ; branchement **preview audio** ; init **chordDetector** → **staffFreeMode** ; lazy init **Pixi** (`initGameView`) : `keyboardViz`, `pianoRoll`, **gameLoop** ; sélection fichier / piste MIDI (`ALL_TRACKS_INDEX`, « Toutes les pistes ») ; `showMenu` / `showGame` / `startReadMode` ; synchro OSMD `_syncOsmdCursor` sur `getCurrentTimeMs()`. **Premier fichier à ouvrir** pour tout ce qui touche au flux global ou au menu. |
| **`src/style.css`** | Layout flex colonnes (`#game-view`), tailles des zones, menu, panneau fichier, boutons. **Modifier** pour responsive, thème, taille des zones staff/roll/keyboard. |

### 6.4 Constantes partagées

| Fichier | Rôle |
|---------|------|
| **`src/constants.ts`** | Vitesses piano roll (`SCROLL_SPEED_PX_PER_SEC`), fenêtre accords (`CHORD_DETECTION_WINDOW_MS`), tolérance validation future (`VALIDATION_TOLERANCE_MS`), plage MIDI clavier (`KEYBOARD_MIN_MIDI` / `MAX`), couleurs Pixi (`COLOR_*`), `DEFAULT_BPM`. **Modifier** pour calibrer difficulté, couleurs, vitesse de chute. |

### 6.5 Couche MIDI

| Fichier | Rôle |
|---------|------|
| **`src/core/midiEngine.ts`** | `initMidi` : WebMidi, premier input branché, hot-plug ; `toMidiNote` ; callbacks `noteon` / `noteoff`. **Modifier** pour multi-inputs, filtrage canal, ou messages autres que notes. |
| **`src/core/keyboardDebug.ts`** | Simulation clavier (AZERTY) vers les mêmes callbacks que le MIDI — utile sur poste sans clavier. **Modifier** pour mapping touches ou activer/désactiver. |

### 6.6 Détection d’accords et logique « mode libre » côté données

| Fichier | Rôle |
|---------|------|
| **`src/core/chordDetector.ts`** | Fenêtre temporelle pour regrouper les `note_on` ; `handleNoteOn` / `handleNoteOff` ; `onChordChange` pour la portée libre. **Modifier** pour changer la logique d’accord ou le debouncing. |

### 6.7 Parsing fichiers et types MIDI

| Fichier | Rôle |
|---------|------|
| **`src/core/fileParser.ts`** | `detectFileType`, `parseMidiFile` (MidiPlayerJS, multi-pistes, `getPlayableTracks`, `getNotesForTrack`, `ALL_TRACKS_INDEX` pour « toutes les pistes »), `parseMxlFile` / types `ParsedMxlFile` (buffer pour OSMD). **Modifier** pour tempo multi-pistes, pistes vides, ou pré-traitement MXL. |
| **`src/types/midi-player-js.d.ts`** | Déclarations TypeScript minimales pour `midi-player-js` (pas de `@types` npm). **Modifier** si l’API utilisée évolue. |

### 6.8 Boucle de jeu et lecture morceau

| Fichier | Rôle |
|---------|------|
| **`src/core/gameLoop.ts`** | `requestAnimationFrame`, `deltaTime`, liste de callbacks `registerUpdateCallback` ; `startGameLoop` / `pauseGameLoop` / `disposeGameLoop`. **Modifier** pour cap FPS, pause globale, ou ordre des updates. |
| **`src/core/readModeScheduler.ts`** | **Temps** `_currentTimeMs` ; **lookahead** (hauteur roll / vitesse) pour spawn des `NoteBlock` ; `spawnReadNote` ; fin de morceau ; **audio morceau** (`previewNoteOn` + `setTimeout` note off) si `_filePlaybackAudioActive` ; `getSchedulerLookaheadMs` (export, utilisable ailleurs). **Modifier** pour calibrage spawn, fin de morceau, ou stratégie audio (ex. relâchements liés au temps musical plutôt qu’à `setTimeout`). |

### 6.9 Modules prévus (étapes futures — souvent vides ou squelettes)

| Fichier | Rôle prévu / actuel |
|---------|---------------------|
| **`src/core/validator.ts`** | **Étape 7** : comparer notes attendues vs MIDI joué, tolérance `VALIDATION_TOLERANCE_MS`, déclencher feedback piano roll + `colorGraphicalNote` OSMD. **À implémenter** ; c’est le fichier pour toute logique de « juste / raté ». |
| **`src/core/scoreTracker.ts`** | **Étape 8** : score, stats fin de morceau. **À implémenter**. |
| **`src/core/playbackControls.ts`** | **Étape 8** : tempo, boucles, métronome. **À implémenter**. |

### 6.10 Rendu PixiJS

| Fichier | Rôle |
|---------|------|
| **`src/gfx/renderer.ts`** | Création `Application` PixiJS sur un canvas + taille zone parente. **Modifier** pour résolution, antialiasing, ou options WebGL. |
| **`src/gfx/pianoRoll.ts`** | Mode `free` / `read` ; pool de blocs ; `spawnReadNote` (position bas du bloc = bas du canvas à l’instant `startMs`) ; `updatePianoRoll` ; `setNoteBlockState` (hit/miss futur). **Modifier** pour physique des blocs, ligne de frappe, couleurs. |
| **`src/gfx/keyboardViz.ts`** | Clavier 2D, `keyOn` / `keyOff` / `allKeysOff`. **Modifier** pour nombre d’octaves, style touches. |

### 6.11 Utilitaires MIDI / math clavier

| Fichier | Rôle |
|---------|------|
| **`src/utils/midiUtils.ts`** | `noteIdToX`, largeur touches blanches/noires, etc. **Modifier** pour layout du clavier ou bornes MIDI. |

### 6.12 Portées : libre (VexFlow) et lecture (OSMD)

| Fichier | Rôle |
|---------|------|
| **`src/notation/staffFreeMode.ts`** | VexFlow dans `#zone-staff` : accords depuis `chordDetector`. **Modifier** pour gravure, clés, armures, ou performance. |
| **`src/notation/staffReadMode.ts`** | OSMD : `load`/`render`, collecte `GraphicalNote` + `startMs`/`durationMs` via `PlaybackSettings.getDurationInMilliseconds`, `getStaffReadModeParsedNotes` pour le scheduler, `updateStaffReadMode` (curseur : boucle `next` + correction `previous`, gestion **fin de partition** / dernière note avec `_playbackEndMs`), `colorGraphicalNote`, `reset` / `dispose`. **Modifier** pour tout ce qui touche partition MXL, curseur, timing MusicXML, ou couleurs SVG notes. |

### 6.13 Audio navigateur

| Fichier | Rôle |
|---------|------|
| **`src/audio/midiPianoPreview.ts`** | `PolySynth` + `FMSynth` ; `installAudioUnlockOnFirstGesture` ; `previewNoteOn` / `previewNoteOff` / `releaseAllPreviewNotes`. Utilisé par `main.ts` (joueur) et `readModeScheduler.ts` (fichier). **Modifier** pour timbre, volume, autre moteur (Sampler, etc.). |

### 6.14 Fichiers secondaires / hors flux principal

| Fichier | Rôle |
|---------|------|
| **`src/counter.ts`** | Exemple type Vite (`setupCounter`) — **non utilisé** par `main.ts`. Peut être supprimé ou ignoré ; ne pas le confondre avec la logique PianoPlay. |
| **`src/assets/*`** | Images / SVG d’exemple Vite ; non requis par le flux actuel. |
| **`LICENSE`** | Licence du dépôt. |

### 6.15 Dossier `poc-osmd/` (preuve de concept)

| Fichier | Rôle |
|---------|------|
| **`poc-osmd/index.html`**, **`poc-osmd/main.js`** | PoC isolé pour expérimenter OSMD / `GraphicalNote` / couleur SVG **en dehors** de l’app principale. **Ne pas** mélanger avec le build Vite de `src/` sauf si vous réintégrez volontairement ce code dans `staffReadMode.ts`. |

---

## 7. Flux détaillés « où modifier quoi »

### 7.1 Une note MIDI arrive du clavier

1. **`midiEngine.ts`** → callback dans **`main.ts`**.
2. **`chordDetector.ts`** (accords) ; **`midiPianoPreview.ts`** (son).
3. Si `_pixiReady` : **`keyboardViz.ts`**, **`pianoRoll.ts`** (`noteOn` / `noteOff` mode libre).
4. **`staffFreeMode.ts`** via `onChordChange` (mode libre avec staff visible).

### 7.2 Lancer le mode libre

- **`main.ts`** : `showGame('free')` → `setPianoRollMode('free')`, affiche `#zone-staff`, `initStaffFreeMode`.

### 7.3 Charger et jouer un `.mid`

- **`main.ts`** + **`fileParser.ts`** ; UI piste dans `main.ts` (`_populateTrackSelect`, `ALL_TRACKS_INDEX`).
- **`startReadMode`** → `showGame('read')`, masque staff, **`readModeScheduler.initScheduler`** avec `getNotesForTrack`, **`startScheduler`**.
- Chaque frame : **`gameLoop`** → **`updateScheduler`** + **`updatePianoRoll`**.

### 7.4 Charger et jouer un `.mxl`

- **`fileParser.parseMxlFile`** (buffer) ; **`initStaffReadMode`** dans **`staffReadMode.ts`** ; notes pour roll : **`getStaffReadModeParsedNotes`**.
- **`main.ts`** : `_syncOsmdCursor` enregistré sur la game loop → **`updateStaffReadMode(getCurrentTimeMs())`**.
- Scheduler + audio fichier comme pour le MIDI.

### 7.5 Pause / quitter / menu

- **`main.ts`** : `pauseScheduler` / `startScheduler` ; `showMenu` → **`stopScheduler`**, **`disposeStaffFreeMode`** / **`disposeStaffReadMode`**, **`releaseAllPreviewNotes`**, `clearPianoRoll`, etc.

---

## 8. Roadmap interne (référence)

Les étapes d’origine du projet prévoient notamment :

- **Étape 7** : validation hit/miss (`validator.ts`), couleur OSMD via `colorGraphicalNote`, `setNoteBlockState` dans `pianoRoll.ts`.
- **Étape 8** : `scoreTracker.ts`, `playbackControls.ts`, UI score / métronome / tempo.

Le **README** doit être mis à jour quand de gros blocs sont livrés (ex. quand `validator.ts` devient non vide).

---

## 9. Notes pour une IA qui modifie le projet

1. **Ne pas supposer** que `src/counter.ts` fait partie du produit.
2. **`tsconfig.json`** n’inclut que `src/` : le dossier **`poc-osmd/`** n’est pas typechecké avec le même projet.
3. **`npm run build`** exécute **`tsc`** : les erreurs `noUnusedLocals` ou imports CSS peuvent faire échouer le build même si Vite seul passerait ; corriger ou ajuster `tsconfig` si besoin.
4. **Synchronisation** : toute modification du **sens du temps** (`startMs`, fin de morceau, lookahead) doit rester **cohérente** entre **`readModeScheduler.ts`**, **`pianoRoll.ts`** (spawn), **`staffReadMode.ts`** (curseur + `_playbackEndMs`), et l’**audio** fichier.
5. **OSMD** : API interne fragile ; les chemins `GraphicSheet.MeasureList` et `GraphicalNote` sont dans **`staffReadMode.ts`** — tester après mise à jour d’`opensheetmusicdisplay`.

---

## 10. Résumé une ligne par dossier

| Dossier / zone | Responsabilité |
|----------------|----------------|
| **`src/main.ts`** | Orchestration, UI menu, choix mode, câblage global. |
| **`src/core/`** | MIDI, temps, parsing, futur score/validation/contrôles. |
| **`src/gfx/`** | PixiJS (roll + clavier). |
| **`src/notation/`** | VexFlow (libre) + OSMD (lecture MXL). |
| **`src/audio/`** | Synthèse navigateur (Tone.js). |
| **`src/utils/`** | Helpers géométrie / MIDI. |
| **`src/types/`** | Ambients pour libs sans types. |
| **`index.html` + `src/style.css`** | Structure page et mise en page. |
| **`songs/`** | Démos. |
| **`poc-osmd/`** | Bac à sable OSMD hors app. |

Ce README suffit à orienter une modification ciblée : identifier le **sous-système** (MIDI, temps, roll, OSMD, audio, UI), ouvrir le **fichier listé**, implémenter, puis vérifier les **flux** de la section 7.

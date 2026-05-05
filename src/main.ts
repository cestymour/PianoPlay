import './style.css';

// ── Éléments DOM ──
const overlayMenu  = document.getElementById('overlay-menu')  as HTMLDivElement;
const gameView     = document.getElementById('game-view')     as HTMLDivElement;
const btnFreeMode  = document.getElementById('btn-free-mode') as HTMLButtonElement;
const btnLoadFile  = document.getElementById('btn-load-file') as HTMLButtonElement;
const btnQuit      = document.getElementById('btn-quit')      as HTMLButtonElement;

// ── Routing basique ──
function showMenu(): void {
  overlayMenu.classList.remove('hidden');
  gameView.classList.add('hidden');
}

function showGame(): void {
  overlayMenu.classList.add('hidden');
  gameView.classList.remove('hidden');
}

// ── Listeners ──
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

// ── Démarrage ──
showMenu();
console.log('[main] PianoPlay initialisé');

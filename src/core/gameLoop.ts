/* ================================================================
   src/core/gameLoop.ts
   Game loop principale — DeltaTime + update isolé de tout rendu SVG
================================================================ */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Callback appelé à chaque frame avec le deltaTime en ms */
type UpdateCallback = (deltaMs: number) => void;

// ─────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────

let _rafId:      number | null = null;
let _lastTime:   number | null = null;
let _callbacks:  UpdateCallback[] = [];
let _running     = false;

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

/**
 * Enregistre un callback à appeler à chaque frame.
 * Peut être appelé plusieurs fois pour brancher plusieurs systèmes
 * (ex: pianoRoll, métronome, validator...).
 *
 * @param cb - Fonction appelée avec deltaMs à chaque frame
 */
export function registerUpdateCallback(cb: UpdateCallback): void {
  _callbacks.push(cb);
}

/**
 * Retire un callback de la loop.
 */
export function unregisterUpdateCallback(cb: UpdateCallback): void {
  _callbacks = _callbacks.filter(fn => fn !== cb);
}

/**
 * Démarre la game loop.
 * Sans effet si elle est déjà en cours.
 */
export function startGameLoop(): void {
  if (_running) return;
  _running   = true;
  _lastTime  = null;
  _rafId     = requestAnimationFrame(_tick);
  console.log('[GameLoop] Démarrée');
}

/**
 * Arrête la game loop proprement.
 */
export function stopGameLoop(): void {
  if (!_running) return;
  _running = false;
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _lastTime = null;
  console.log('[GameLoop] Arrêtée');
}

/**
 * Indique si la game loop est active.
 */
export function isGameLoopRunning(): boolean {
  return _running;
}

/**
 * Retire tous les callbacks et arrête la loop.
 * Utile pour un reset complet (ex: retour au menu).
 */
export function disposeGameLoop(): void {
  stopGameLoop();
  _callbacks = [];
  console.log('[GameLoop] Disposée');
}

// ─────────────────────────────────────────────
// Boucle interne
// ─────────────────────────────────────────────

function _tick(timestamp: number): void {
  if (!_running) return;

  // Calcul du deltaTime
  if (_lastTime === null) _lastTime = timestamp;
  const deltaMs = timestamp - _lastTime;
  _lastTime     = timestamp;

  // Clamp du deltaMs : évite les sauts énormes après un onglet mis en veille
  const clampedDelta = Math.min(deltaMs, 100);

  // Appel de tous les systèmes enregistrés
  for (const cb of _callbacks) {
    cb(clampedDelta);
  }

  // Frame suivante
  _rafId = requestAnimationFrame(_tick);
}

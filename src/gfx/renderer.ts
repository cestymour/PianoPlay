/* ================================================================
   src/gfx/renderer.ts
   Initialisation de l'application PixiJS (piano roll + clavier)
================================================================ */

import { Application } from 'pixi.js';

/** Cache des instances PixiJS par canvas — évite la recréation de contexte WebGL */
const _instances = new Map<HTMLCanvasElement, Application>();

/**
 * Initialise PixiJS sur le canvas cible.
 * Si une instance existe déjà pour ce canvas, elle est retournée directement
 * sans recréer de contexte WebGL (évite les erreurs uniformMatrix3fv).
 *
 * @param canvas  - L'élément <canvas> HTML cible
 * @param width   - Largeur en pixels
 * @param height  - Hauteur en pixels
 */
export async function initRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<Application> {

  // ── Réutilisation de l'instance existante ──────────────────────────────────
  if (_instances.has(canvas)) {
    console.log('[Renderer] Instance PixiJS réutilisée');
    return _instances.get(canvas)!;
  }

  // ── Première initialisation ────────────────────────────────────────────────
  const app = new Application();

  await app.init({
    canvas,
    width,
    height,
    backgroundColor: 0x111111,
    antialias: false,      // Désactivé pour les perfs tablette
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  _instances.set(canvas, app);
  console.log(`[Renderer] PixiJS initialisé (${width}×${height})`);
  return app;
}

/**
 * Retourne l'instance PixiJS associée à un canvas (ou null).
 */
export function getAppForCanvas(canvas: HTMLCanvasElement): Application | null {
  return _instances.get(canvas) ?? null;
}

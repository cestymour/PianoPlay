/* ================================================================
   src/gfx/renderer.ts
   Initialisation de l'application PixiJS (piano roll + clavier)
================================================================ */

import { Application } from 'pixi.js';

let _app: Application | null = null;

/**
 * Initialise PixiJS sur le canvas cible.
 * @param canvas  - L'élément <canvas> HTML cible
 * @param width   - Largeur en pixels
 * @param height  - Hauteur en pixels
 */
export async function initRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<Application> {
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

  _app = app;
  console.log(`[Renderer] PixiJS initialisé (${width}×${height})`);
  return app;
}

/**
 * Retourne l'instance PixiJS active (ou null si non initialisée).
 */
export function getApp(): Application | null {
  return _app;
}

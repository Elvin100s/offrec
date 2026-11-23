/**
 * Camera overlay rectangle, normalized to the composite canvas:
 * x and w are fractions of the canvas width, y is a fraction of the canvas height.
 * The height is derived from w and the camera's real aspect ratio, so the
 * camera is never stretched.
 */
export interface Overlay {
  x: number;
  y: number;
  w: number;
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
export const MIN_W = 0.1;
export const MAX_W = 0.5;
export const MARGIN = 0.02;
export const DEFAULT_W = 0.18;
export const DEFAULT_CORNER: Corner = 'br';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Overlay height as a fraction of the canvas height. */
export function heightFraction(w: number, canvasW: number, canvasH: number, aspect: number): number {
  return (w * canvasW) / aspect / canvasH;
}

/** Largest overlay width (fraction of canvas width) that still fits the canvas height. */
function maxWidthFor(canvasW: number, canvasH: number, aspect: number): number {
  return Math.min(MAX_W, (canvasH * aspect) / canvasW);
}

/** Keeps the overlay within size limits and fully inside the canvas. */
export function clampOverlay(o: Overlay, canvasW: number, canvasH: number, aspect: number): Overlay {
  const maxW = maxWidthFor(canvasW, canvasH, aspect);
  const w = clamp(o.w, Math.min(MIN_W, maxW), maxW);
  const h = heightFraction(w, canvasW, canvasH, aspect);
  return {
    w,
    x: clamp(o.x, 0, 1 - w),
    y: clamp(o.y, 0, Math.max(0, 1 - h)),
  };
}

/** Snaps an overlay of width w into a corner with a 2% margin (same pixel margin on both axes). */
export function cornerOverlay(corner: Corner, w: number, canvasW: number, canvasH: number, aspect: number): Overlay {
  const sized = clampOverlay({ x: 0, y: 0, w }, canvasW, canvasH, aspect);
  const h = heightFraction(sized.w, canvasW, canvasH, aspect);
  const mx = MARGIN;
  const my = (MARGIN * canvasW) / canvasH;
  const x = corner[1] === 'l' ? mx : 1 - mx - sized.w;
  const y = corner[0] === 't' ? my : 1 - my - h;
  return clampOverlay({ x, y, w: sized.w }, canvasW, canvasH, aspect);
}

/** Moves the overlay by a pixel delta (canvas pixels). */
export function moveOverlay(start: Overlay, dx: number, dy: number, canvasW: number, canvasH: number, aspect: number): Overlay {
  return clampOverlay(
    { w: start.w, x: start.x + dx / canvasW, y: start.y + dy / canvasH },
    canvasW,
    canvasH,
    aspect,
  );
}

/**
 * Resizes from a corner handle by a pixel delta (canvas pixels). The opposite
 * corner stays fixed and the camera's aspect ratio is kept.
 */
export function resizeOverlay(
  start: Overlay,
  handle: Corner,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number,
  aspect: number,
): Overlay {
  const sw = start.w * canvasW;
  const sh = sw / aspect;
  const sx = start.x * canvasW;
  const sy = start.y * canvasH;
  const right = handle[1] === 'r';
  const bottom = handle[0] === 'b';
  const anchorX = right ? sx : sx + sw;
  const anchorY = bottom ? sy : sy + sh;

  // Follow whichever axis the pointer moved further along.
  const byX = sw + (right ? dx : -dx);
  const byY = sw + (bottom ? dy : -dy) * aspect;
  let nw = Math.abs(byX - sw) >= Math.abs(byY - sw) ? byX : byY;

  const roomW = right ? canvasW - anchorX : anchorX;
  const roomH = (bottom ? canvasH - anchorY : anchorY) * aspect;
  const maxPx = Math.min(MAX_W * canvasW, roomW, roomH);
  nw = clamp(nw, Math.min(MIN_W * canvasW, maxPx), maxPx);
  const nh = nw / aspect;

  const nx = right ? anchorX : anchorX - nw;
  const ny = bottom ? anchorY : anchorY - nh;
  return clampOverlay({ x: nx / canvasW, y: ny / canvasH, w: nw / canvasW }, canvasW, canvasH, aspect);
}

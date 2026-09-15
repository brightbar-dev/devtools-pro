/** Screenshot geometry: viewport tiles for tall captures, device-pixel crops, and file names. */

import type { Rect } from './geometry';

/** Chrome allows two `captureVisibleTab` calls per second per extension. */
export const CAPTURE_INTERVAL_MS = 550;

/** Tallest capture in CSS pixels; keeps the stitched canvas inside browser limits. */
export const MAX_CAPTURE_HEIGHT = 16000;

export interface Tile {
  /** Where to scroll the page for this capture. */
  scrollY: number;
  /** Document y of the first row this tile contributes. */
  fromY: number;
  /** Rows this tile contributes, in CSS pixels. */
  height: number;
}

/**
 * Viewport-high captures that cover document rows `[start, end)`. Near the bottom the page
 * cannot scroll further, so the last tile contributes rows from part-way down its viewport.
 */
export function captureTiles(start: number, end: number, viewportHeight: number, maxScrollY: number): Tile[] {
  const tiles: Tile[] = [];
  let covered = start;
  while (covered < end && viewportHeight > 0) {
    const scrollY = Math.max(0, Math.min(covered, maxScrollY));
    const height = Math.min(viewportHeight - (covered - scrollY), end - covered);
    if (height <= 0) break;
    tiles.push({ scrollY, fromY: covered, height });
    covered += height;
  }
  return tiles;
}

export interface DeviceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** The device-pixel rectangle of a CSS-pixel rect within a capture, clamped to the capture. */
export function deviceCrop(rect: Rect, dpr: number, capture: { width: number; height: number }): DeviceRect {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const sx = clamp(Math.round(rect.left * dpr), capture.width);
  const sy = clamp(Math.round(rect.top * dpr), capture.height);
  const ex = clamp(Math.round((rect.left + rect.width) * dpr), capture.width);
  const ey = clamp(Math.round((rect.top + rect.height) * dpr), capture.height);
  return { sx, sy, sw: Math.max(0, ex - sx), sh: Math.max(0, ey - sy) };
}

export type CaptureKind = 'visible' | 'page' | 'element';

/** e.g. `stripe.com-page-2026-09-15-05-43-10.png` (UTC). */
export function screenshotFilename(kind: CaptureKind, host: string, date: Date): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const site = host.replace(/^www\./, '').replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '') || 'page';
  return `${site}-${kind}-${stamp}.png`;
}

/** Decode a `data:` URL to bytes without fetch, which some page policies block. */
export function dataUrlBytes(dataUrl: string): { mime: string; bytes: Uint8Array<ArrayBuffer> } {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('Not a data URL');
  const [, mime = 'application/octet-stream', base64, body = ''] = match;
  if (!base64) return { mime, bytes: new TextEncoder().encode(decodeURIComponent(body)) as Uint8Array<ArrayBuffer> };
  const binary = atob(body);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes };
}

/** Message shapes exchanged between the popup, the background and the injected inspector. */

import type { Rect } from './geometry';
import type { PanelModel } from './inspect';

export type CollectKind = 'meta' | 'css-vars' | 'accessibility' | 'assets';

export type InspectorMessage =
  | { action: 'dtp:activate'; toolId: string }
  | { action: 'dtp:deactivate' }
  | { action: 'dtp:pin'; pinned: boolean }
  | { action: 'dtp:state' }
  | { action: 'dtp:collect'; what: CollectKind };

export interface InspectorReply {
  ok: boolean;
  error?: string;
  activeTool?: string | null;
}

/** Sent by a frame to the background, which relays `message` to every frame of the sender's tab. */
export interface BroadcastRequest {
  action: 'dtp:broadcast';
  message: InspectorMessage;
}

const RELAYABLE_ACTIONS = new Set(['dtp:activate', 'dtp:deactivate', 'dtp:pin']);

/** Only tool switching, exit and pinning may be relayed; collectors and state queries may not. */
export function isRelayable(message: unknown): message is InspectorMessage {
  if (typeof message !== 'object' || message === null) return false;
  return RELAYABLE_ACTIONS.has(String((message as { action?: unknown }).action));
}

/** Protocol tag on postMessage traffic between a frame's inspector and its parent's. */
export const FRAME_PROTOCOL = 'devtools-pro/frame/1';

export type FrameMessage =
  | { protocol: typeof FRAME_PROTOCOL; type: 'hover'; rect: Rect; model: PanelModel }
  | { protocol: typeof FRAME_PROTOCOL; type: 'rect'; rect: Rect };

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return ['left', 'top', 'width', 'height'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

function isModel(value: unknown): value is PanelModel {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m.toolId === 'string' && typeof m.title === 'string'
    && Array.isArray(m.path) && m.path.every(s => typeof (s as { label?: unknown })?.label === 'string')
    && Array.isArray(m.blocks) && m.blocks.every(b => typeof (b as { kind?: unknown })?.kind === 'string');
}

/** Accept a postMessage payload only if it is ours and well-formed; anything else is ignored. */
export function parseFrameMessage(data: unknown): FrameMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.protocol !== FRAME_PROTOCOL || !isRect(d.rect)) return null;
  if (d.type === 'rect') return { protocol: FRAME_PROTOCOL, type: 'rect', rect: d.rect };
  if (d.type === 'hover' && isModel(d.model)) return { protocol: FRAME_PROTOCOL, type: 'hover', rect: d.rect, model: d.model };
  return null;
}

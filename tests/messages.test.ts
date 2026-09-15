import { describe, it, expect } from 'vitest';
import { FRAME_PROTOCOL, isRelayable, parseFrameMessage } from '../utils/messages';

const rect = { left: 1, top: 2, width: 3, height: 4 };
const model = { toolId: 'css-inspect', title: 'CSS Inspector', path: [{ label: 'div' }], blocks: [{ kind: 'note', text: 'x' }] };

describe('isRelayable', () => {
  it('relays tool switching, exit and pinning', () => {
    expect(isRelayable({ action: 'dtp:activate', toolId: 'spacing' })).toBe(true);
    expect(isRelayable({ action: 'dtp:deactivate' })).toBe(true);
    expect(isRelayable({ action: 'dtp:pin', pinned: true })).toBe(true);
  });

  it('refuses collectors, state queries, other actions and junk', () => {
    expect(isRelayable({ action: 'dtp:collect', what: 'meta' })).toBe(false);
    expect(isRelayable({ action: 'dtp:state' })).toBe(false);
    expect(isRelayable({ action: 'captureTab' })).toBe(false);
    expect(isRelayable(null)).toBe(false);
    expect(isRelayable('dtp:deactivate')).toBe(false);
  });
});

describe('parseFrameMessage', () => {
  it('accepts a well-formed hover report', () => {
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'hover', rect, model })).toEqual({ protocol: FRAME_PROTOCOL, type: 'hover', rect, model });
  });

  it('accepts a rect update and drops extra fields', () => {
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'rect', rect, extra: 1 })).toEqual({ protocol: FRAME_PROTOCOL, type: 'rect', rect });
  });

  it('ignores other protocols, bad rects and malformed models', () => {
    expect(parseFrameMessage({ protocol: 'other', type: 'rect', rect })).toBeNull();
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'rect', rect: { ...rect, left: Number.NaN } })).toBeNull();
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'rect', rect: { left: '1', top: 2, width: 3, height: 4 } })).toBeNull();
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'hover', rect, model: { ...model, blocks: 'nope' } })).toBeNull();
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'hover', rect, model: { ...model, path: [{ label: 5 }] } })).toBeNull();
    expect(parseFrameMessage({ protocol: FRAME_PROTOCOL, type: 'teleport', rect })).toBeNull();
    expect(parseFrameMessage('hello')).toBeNull();
    expect(parseFrameMessage(undefined)).toBeNull();
  });
});

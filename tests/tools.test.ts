import { describe, it, expect } from 'vitest';
import { TOOLS, HOVER_TOOLS, findTool, getTool, getHoverTool, UnknownToolError } from '../utils/tools';

describe('TOOLS', () => {
  it('has 12 tools total, all available with no payment state', () => {
    expect(TOOLS.length).toBe(12);
  });

  it('all tools have unique ids', () => {
    const ids = TOOLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no tool carries a tier/pro distinction', () => {
    for (const tool of TOOLS) {
      expect(tool).not.toHaveProperty('tier');
    }
  });

  it('includes the formerly-Pro tools with no gating data attached', () => {
    const formerlyPro = ['screenshot', 'accessibility', 'css-vars', 'rulers', 'grid-overlay', 'assets'];
    for (const id of formerlyPro) {
      expect(TOOLS.some(t => t.id === id)).toBe(true);
    }
  });

  it('classifies every tool by how it runs', () => {
    expect(HOVER_TOOLS.map(t => t.id)).toEqual(['css-inspect', 'color-picker', 'font-detect', 'spacing', 'element-info', 'rulers', 'grid-overlay']);
    expect(TOOLS.filter(t => t.kind === 'page').map(t => t.id)).toEqual(['meta-tags', 'accessibility', 'css-vars', 'assets']);
    expect(TOOLS.filter(t => t.kind === 'capture').map(t => t.id)).toEqual(['screenshot']);
  });

  it('gives every tool a short toolbar label', () => {
    for (const tool of TOOLS) {
      expect(tool.shortName.length).toBeGreaterThan(0);
      expect(tool.shortName.length).toBeLessThanOrEqual(8);
    }
  });
});

describe('tool lookup', () => {
  it('finds a tool by id', () => {
    expect(getTool('rulers').name).toBe('Rulers');
    expect(findTool('assets')?.kind).toBe('page');
  });

  it('findTool returns undefined for an unknown id', () => {
    expect(findTool('nope')).toBeUndefined();
  });

  it('getTool throws an UnknownToolError that names the bad id', () => {
    expect(() => getTool('css-inspector')).toThrow(UnknownToolError);
    expect(() => getTool('css-inspector')).toThrow('"css-inspector"');
  });

  it('getHoverTool rejects page and capture tools instead of falling back to the CSS panel', () => {
    expect(() => getHoverTool('meta-tags')).toThrow(/page tool/);
    expect(() => getHoverTool('screenshot')).toThrow(/capture tool/);
    expect(() => getHoverTool('')).toThrow(UnknownToolError);
    expect(getHoverTool('spacing').id).toBe('spacing');
  });
});

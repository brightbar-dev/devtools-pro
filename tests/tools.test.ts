import { describe, it, expect } from 'vitest';
import { TOOLS } from '../utils/tools';

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
});

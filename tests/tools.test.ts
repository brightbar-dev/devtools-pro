import { describe, it, expect } from 'vitest';
import {
  TOOLS, getFreeTool, getProTool, freeTools, proTools, isProTool,
} from '../utils/tools';

describe('TOOLS', () => {
  it('has 12 tools total', () => {
    expect(TOOLS.length).toBe(12);
  });

  it('has 6 free tools', () => {
    expect(TOOLS.filter(t => t.tier === 'free').length).toBe(6);
  });

  it('has 6 pro tools', () => {
    expect(TOOLS.filter(t => t.tier === 'pro').length).toBe(6);
  });

  it('all tools have unique ids', () => {
    const ids = TOOLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getFreeTool', () => {
  it('finds free tool', () => {
    expect(getFreeTool('css-inspect')?.name).toBe('CSS Inspector');
  });

  it('returns undefined for pro tool', () => {
    expect(getFreeTool('screenshot')).toBeUndefined();
  });
});

describe('getProTool', () => {
  it('finds pro tool', () => {
    expect(getProTool('screenshot')?.name).toBe('Screenshot');
  });

  it('returns undefined for free tool', () => {
    expect(getProTool('css-inspect')).toBeUndefined();
  });
});

describe('freeTools', () => {
  it('returns only free tools', () => {
    const free = freeTools();
    expect(free.every(t => t.tier === 'free')).toBe(true);
    expect(free.length).toBe(6);
  });
});

describe('proTools', () => {
  it('returns only pro tools', () => {
    const pro = proTools();
    expect(pro.every(t => t.tier === 'pro')).toBe(true);
    expect(pro.length).toBe(6);
  });
});

describe('isProTool', () => {
  it('true for pro tools', () => expect(isProTool('screenshot')).toBe(true));
  it('false for free tools', () => expect(isProTool('css-inspect')).toBe(false));
  it('false for unknown', () => expect(isProTool('nonexistent')).toBe(false));
});

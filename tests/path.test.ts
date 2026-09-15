import { describe, it, expect } from 'vitest';
import { formatPath, type PathSegment } from '../utils/dom';

const seg = (label: string, boundary?: PathSegment['boundary']): PathSegment => (boundary ? { label, boundary } : { label });

describe('formatPath', () => {
  it('joins light-DOM steps', () => {
    expect(formatPath([seg('main'), seg('section.grid-demo'), seg('div')])).toBe('main › section.grid-demo › div');
  });

  it('marks a shadow-root boundary', () => {
    expect(formatPath([seg('main'), seg('div#shadow-host'), seg('div.inner', 'shadow')])).toBe('main › div#shadow-host ⟫ #shadow-root ⟫ div.inner');
  });

  it('marks a frame boundary', () => {
    expect(formatPath([seg('main'), seg('iframe'), seg('div.iframe-el', 'frame')])).toBe('main › iframe ⟫ frame ⟫ div.iframe-el');
  });

  it('keeps the last steps and shows that it truncated', () => {
    const path = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(l => seg(l));
    expect(formatPath(path, 3)).toBe('… › e › f › g');
  });

  it('keeps a boundary marker on the first shown step', () => {
    const path = [seg('a'), seg('host'), seg('x', 'shadow'), seg('y')];
    expect(formatPath(path, 2)).toBe('… ⟫ #shadow-root ⟫ x › y');
  });

  it('handles an empty path', () => {
    expect(formatPath([])).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { editFormHtml, editValue, toColorInput, type EditFormState } from '../utils/edit-form';

const state = (over: Partial<EditFormState> = {}): EditFormState => ({
  selector: 'section.flex-demo › span',
  text: 'Flex A',
  margin: [0, 0, 0, 0],
  padding: [8, 16, 8, 16],
  color: '#ffffff',
  background: '#e03131',
  backgroundTransparent: false,
  fontSize: 16,
  canUndo: false,
  canRedo: false,
  changes: 0,
  ...over,
});

describe('toColorInput', () => {
  it('turns computed colours into #rrggbb, dropping alpha', () => {
    expect(toColorInput('rgb(224, 49, 49)')).toBe('#e03131');
    expect(toColorInput('rgba(0, 0, 0, 0)')).toBe('#000000');
    expect(toColorInput('oklch(1 0 0)')).toBe('#ffffff');
    expect(toColorInput('nonsense')).toBe('#000000');
  });
});

describe('editValue', () => {
  it('reads numbers as pixels and empty as clearing the edit', () => {
    expect(editValue('padding-top', '20')).toBe('20px');
    expect(editValue('margin-left', '-4.5')).toBe('-4.5px');
    expect(editValue('font-size', '')).toBe('');
    expect(editValue('font-size', 'abc')).toBe('');
  });

  it('accepts only #rrggbb for colours and passes text through', () => {
    expect(editValue('color', '#3B5BDB')).toBe('#3b5bdb');
    expect(editValue('background-color', 'red')).toBe('');
    expect(editValue('#text', '  Sign up ')).toBe('  Sign up ');
  });
});

describe('editFormHtml', () => {
  it('renders every editable field with the element’s current values', () => {
    const html = editFormHtml(state());
    expect(html).toContain('<textarea data-edit="#text" rows="2" aria-label="Text">Flex A</textarea>');
    expect(html).toContain('data-edit="padding-right" value="16"');
    expect(html).toContain('data-edit="margin-top" value="0"');
    expect(html).toContain('<input type="color" data-edit="background-color" value="#e03131">');
    expect(html).toContain('data-edit="font-size" value="16"');
  });

  it('escapes page text so it cannot break out of the textarea', () => {
    const html = editFormHtml(state({ text: '</textarea><img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('does not offer text editing for elements with children', () => {
    const html = editFormHtml(state({ text: null }));
    expect(html).not.toContain('data-edit="#text"');
    expect(html).toContain('contains other elements');
  });

  it('enables undo, redo, reset all and copy only when they would do something', () => {
    const idle = editFormHtml(state());
    expect(idle).toContain('data-edit-action="undo" disabled');
    expect(idle).toContain('data-edit-action="copy" disabled');
    const busy = editFormHtml(state({ canUndo: true, canRedo: true, changes: 2 }));
    expect(busy).not.toContain('disabled');
    expect(busy).toContain('2 changes on this page');
  });

  it('marks a transparent background', () => {
    expect(editFormHtml(state({ backgroundTransparent: true }))).toContain('Background (none)');
  });
});

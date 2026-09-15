import { describe, it, expect } from 'vitest';
import { copiedCssModel, copiedTailwindModel, cssRuleText, withoutRedundantShorthands } from '../utils/copy-formats';
import { nonDefaultDeclarations } from '../utils/css';
import { toTailwind } from '../utils/tailwind';
import { renderPanelHtml } from '../utils/panel-render';

const pill: Record<string, string> = {
  display: 'block',
  'padding-top': '8px', 'padding-right': '16px', 'padding-bottom': '8px', 'padding-left': '16px',
  'background-color': 'rgb(224, 49, 49)',
  color: 'rgb(255, 255, 255)',
  'border-radius': '4px',
  'border-top-left-radius': '4px', 'border-top-right-radius': '4px', 'border-bottom-right-radius': '4px', 'border-bottom-left-radius': '4px',
  'text-align': 'start',
};
const decls = nonDefaultDeclarations(prop => pill[prop] ?? '').map(({ prop, value }) => ({ prop, value }));

describe('nonDefaultDeclarations', () => {
  it('hides initial values and the colour of a border side with no width', () => {
    const style: Record<string, string> = { display: 'block', top: 'auto', 'min-width': '0px', 'max-width': 'none', 'margin-top': '0px', 'padding-left': '0px', 'border-radius': '0px', 'border-top-width': '0px', 'border-top-color': 'rgb(51, 51, 51)', 'border-left-width': '2px', 'border-left-color': 'rgb(51, 51, 51)', 'border-left-style': 'solid' };
    expect(nonDefaultDeclarations(p => style[p] ?? '').map(d => d.prop)).toEqual(['display', 'border-left-width', 'border-left-style', 'border-left-color']);
  });

  it('keeps panel order, skips defaults and irrelevant categories', () => {
    expect(decls.map(d => d.prop)).toEqual([
      'display',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
      'color',
      'background-color',
    ]);
  });
});

describe('cssRuleText', () => {
  it('writes a pasteable rule with the path as a comment and no redundant shorthands', () => {
    const text = cssRuleText('span', decls, [{ label: 'main' }, { label: 'section.flex-demo' }, { label: 'span' }]);
    expect(text).toBe([
      '/* main › section.flex-demo › span */',
      'span {',
      '  display: block;',
      '  padding-top: 8px;',
      '  padding-right: 16px;',
      '  padding-bottom: 8px;',
      '  padding-left: 16px;',
      '  border-top-left-radius: 4px;',
      '  border-top-right-radius: 4px;',
      '  border-bottom-left-radius: 4px;',
      '  border-bottom-right-radius: 4px;',
      '  color: rgb(255, 255, 255);',
      '  background-color: rgb(224, 49, 49);',
      '}',
    ].join('\n'));
  });

  it('keeps a shorthand whose longhands are not all present', () => {
    expect(withoutRedundantShorthands([{ prop: 'gap', value: '8px' }, { prop: 'row-gap', value: '8px' }]).map(d => d.prop)).toEqual(['gap', 'row-gap']);
  });
});

describe('copied panels', () => {
  it('shows the copied CSS as a code block', () => {
    const model = copiedCssModel('span {\n}', 12, []);
    expect(model.title).toBe('Copied as CSS · 12 declarations');
    expect(renderPanelHtml(model)).toContain('<pre class="code copyable" data-copy="span {\n}" title="Click to copy">span {\n}</pre>');
  });

  it('shows Tailwind classes and every declaration it could not map', () => {
    const result = toTailwind([...decls, { prop: 'filter', value: 'blur(2px)' }]);
    expect(result.classes).toEqual(expect.arrayContaining(['block', 'px-4', 'py-2', 'rounded', 'text-white', 'bg-[#e03131]']));
    const model = copiedTailwindModel(result, []);
    expect(model.title).toMatch(/^Copied as Tailwind · \d+ classes$/);
    expect(model.blocks[1]).toEqual({ kind: 'rows', title: 'Not mapped · 1', rows: [{ label: 'filter', value: 'blur(2px)', copy: 'filter: blur(2px);' }] });
  });

  it('says when everything mapped', () => {
    expect(copiedTailwindModel({ classes: ['block'], unmapped: [] }, []).blocks[1]).toEqual({ kind: 'note', text: 'Every declaration mapped to a class.' });
  });
});

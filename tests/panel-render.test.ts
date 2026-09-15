import { describe, it, expect } from 'vitest';
import { renderPanelHtml, safeCssValue, safeStyle } from '../utils/panel-render';
import type { PanelModel } from '../utils/inspect';

function model(blocks: PanelModel['blocks'], path = [{ label: 'main' }]): PanelModel {
  return { toolId: 'css-inspect', title: 'CSS Inspector', path, blocks };
}

describe('safeCssValue', () => {
  it('accepts ordinary computed values', () => {
    expect(safeCssValue('rgb(224, 49, 49)')).toBe('rgb(224, 49, 49)');
    expect(safeCssValue('"Fixture Font", Georgia, serif')).toBe('"Fixture Font", Georgia, serif');
    expect(safeCssValue('#3b5bdb')).toBe('#3b5bdb');
  });

  it('rejects declaration breaks, markup and resource loads', () => {
    expect(safeCssValue('red; background: blue')).toBeNull();
    expect(safeCssValue('url(https://example.com/x.png)')).toBeNull();
    expect(safeCssValue('image-set("a.png" 1x)')).toBeNull();
    expect(safeCssValue('</style><script>')).toBeNull();
    expect(safeCssValue('red\\3b')).toBeNull();
  });
});

describe('safeStyle', () => {
  it('drops unsafe values, bad property names and empty values', () => {
    expect(safeStyle({ color: 'red', background: 'url(x)', 'font-size': '', 'Bad Prop': 'x' })).toEqual({ color: 'red' });
  });
});

describe('renderPanelHtml', () => {
  it('escapes every page-supplied string', () => {
    const html = renderPanelHtml(model(
      [{ kind: 'rows', title: '<b>t</b>', rows: [{ label: '<img src=x onerror=alert(1)>', value: '"><script>alert(1)</script>', copy: '" onclick="x' }] }],
      [{ label: 'div#<svg/onload=alert(1)>' }],
    ));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('" onclick="');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('data-copy="&quot; onclick=&quot;x"');
  });

  it('carries swatch colors as a vetted data attribute, never an inline style', () => {
    const html = renderPanelHtml(model([{ kind: 'rows', rows: [
      { label: 'color', value: 'red', swatch: 'red' },
      { label: 'background', value: 'x', swatch: 'url(https://evil.example/)' },
    ] }]));
    expect(html).not.toContain(' style=');
    expect(html).toContain('data-dtp-style="{&quot;background&quot;:&quot;red&quot;}"');
    expect(html).not.toContain('evil.example');
  });

  it('renders the title and a shortened path with the full path in its tooltip', () => {
    const path = ['html', 'body', 'main', 'section', 'div', 'span'].map(label => ({ label }));
    const html = renderPanelHtml(model([], path));
    expect(html).toContain('<div class="panel-title">CSS Inspector</div>');
    expect(html).toContain('title="html › body › main › section › div › span"');
    expect(html).toContain('>… › body › main › section › div › span</div>');
  });

  it('renders colors as copyable values and contrast with a rating class', () => {
    const html = renderPanelHtml(model([
      { kind: 'colors', colors: [{ label: 'Text', hex: '#ffffff', rgb: 'rgb(255, 255, 255)', hsl: 'hsl(0, 0%, 100%)' }] },
      { kind: 'contrast', ratio: 1.2345, rating: 'Fail' },
    ]));
    expect(html).toContain('data-copy="#ffffff"');
    expect(html).toContain('data-copy="hsl(0, 0%, 100%)"');
    expect(html).toContain('Contrast: 1.23:1');
    expect(html).toContain('class="badge fail"');
  });

  it('renders the box model with rounded content size', () => {
    const side = { top: 0, right: 4, bottom: 0, left: 4 };
    const html = renderPanelHtml(model([{ kind: 'box', box: { content: { width: 158.4, height: 77.6 }, padding: side, border: side, margin: side } }]));
    expect(html).toContain('158 x 78');
    expect(html).toContain('<span>4px</span>');
  });

  it('renders a note and a font preview with vetted styles', () => {
    const html = renderPanelHtml(model([
      { kind: 'preview', text: 'The quick brown fox', style: { 'font-family': 'Georgia, serif', color: 'red;x:y' } },
      { kind: 'note', text: 'Cross-origin frame' },
    ]));
    expect(html).toContain('data-dtp-style="{&quot;font-family&quot;:&quot;Georgia, serif&quot;}"');
    expect(html).toContain('<div class="note">Cross-origin frame</div>');
  });
});

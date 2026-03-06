import { describe, it, expect } from 'vitest';
import {
  elementSelector, elementPath, formatDimensions,
  textPreview, escapeHtml, uniqueSelector, categorizeMeta,
} from '../utils/dom';

describe('elementSelector', () => {
  it('generates tag#id', () => {
    expect(elementSelector({ tagName: 'DIV', id: 'main' })).toBe('div#main');
  });

  it('generates tag.class', () => {
    expect(elementSelector({ tagName: 'SPAN', className: 'foo bar' })).toBe('span.foo.bar');
  });

  it('limits to 3 classes', () => {
    expect(elementSelector({ tagName: 'DIV', className: 'a b c d e' })).toBe('div.a.b.c');
  });

  it('falls back to just tag', () => {
    expect(elementSelector({ tagName: 'P' })).toBe('p');
  });

  it('prefers id over class', () => {
    expect(elementSelector({ tagName: 'DIV', id: 'x', className: 'y' })).toBe('div#x');
  });
});

describe('elementPath', () => {
  it('joins selectors', () => {
    expect(elementPath(['html', 'body', 'div#main'])).toBe('html > body > div#main');
  });
});

describe('formatDimensions', () => {
  it('rounds and formats', () => {
    expect(formatDimensions(100.7, 50.3)).toBe('101 x 50');
  });
});

describe('textPreview', () => {
  it('returns short text as-is', () => {
    expect(textPreview('hello')).toBe('hello');
  });

  it('truncates long text', () => {
    const long = 'a'.repeat(100);
    expect(textPreview(long, 50)).toBe('a'.repeat(50) + '...');
  });

  it('collapses whitespace', () => {
    expect(textPreview('  hello   world  ')).toBe('hello world');
  });
});

describe('escapeHtml', () => {
  it('escapes special chars', () => {
    expect(escapeHtml('<script>"test"</script>')).toBe('&lt;script&gt;&quot;test&quot;&lt;/script&gt;');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('uniqueSelector', () => {
  it('uses id when available', () => {
    expect(uniqueSelector([{ tag: 'div', id: 'main' }])).toBe('div#main');
  });

  it('uses nth-child', () => {
    expect(uniqueSelector([
      { tag: 'body' },
      { tag: 'div', nth: 2 },
      { tag: 'p', nth: 1 },
    ])).toBe('body > div:nth-child(2) > p:nth-child(1)');
  });
});

describe('categorizeMeta', () => {
  it('detects og tags', () => expect(categorizeMeta('og:title')).toBe('og'));
  it('detects twitter tags', () => expect(categorizeMeta('twitter:card')).toBe('twitter'));
  it('detects standard meta', () => expect(categorizeMeta('description')).toBe('meta'));
  it('detects viewport', () => expect(categorizeMeta('viewport')).toBe('meta'));
  it('detects other', () => expect(categorizeMeta('something-custom')).toBe('other'));
});

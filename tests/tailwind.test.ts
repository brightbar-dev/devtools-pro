import { describe, it, expect } from 'vitest';
import { toTailwind, arbitrary } from '../utils/tailwind';
import type { Declaration } from '../utils/tailwind';

/** Parse `prop: value; prop: value` into declarations. */
function decls(css: string): Declaration[] {
  return css.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf(':');
    return { prop: s.slice(0, i).trim(), value: s.slice(i + 1).trim() };
  });
}

function tw(css: string) {
  return toTailwind(decls(css));
}

function classes(css: string): string[] {
  return tw(css).classes;
}

/** Expand a `%` pattern across the four sides, e.g. `border-%-width`. */
function four(pattern: string, value: string): string {
  return ['top', 'right', 'bottom', 'left'].map(s => `${pattern.replace('%', s)}: ${value}`).join('; ');
}

const PILL = [
  'display: block',
  four('padding-%', '8px').replace(/padding-(right|left): 8px/g, 'padding-$1: 16px'),
  'background-color: rgb(224, 49, 49)',
  'color: rgb(255, 255, 255)',
  'border-top-left-radius: 4px; border-top-right-radius: 4px',
  'border-bottom-right-radius: 4px; border-bottom-left-radius: 4px',
  'font-size: 16px',
  'transform: matrix(1, 0, 0, 1, 0, 0)',
].join('; ');

describe('arbitrary', () => {
  it('replaces spaces with underscores', () => {
    expect(arbitrary('0 1px 2px rgb(0 0 0 / 0.1)')).toBe('0_1px_2px_rgb(0_0_0_/_0.1)');
  });

  it('drops spaces around commas and trims', () => {
    expect(arbitrary(' 0 1px 2px rgba(0, 0, 0, 0.1), 0 0 0 1px red ')).toBe('0_1px_2px_rgba(0,0,0,0.1),0_0_0_1px_red');
  });
});

describe('defaults', () => {
  it('produce no classes and are not reported as unmapped', () => {
    const result = tw([
      'display: inline', 'position: static', 'opacity: 1', 'flex-grow: 0', 'flex-shrink: 1',
      'margin-top: 0px', 'padding-left: 0px', 'border-top-width: 0px', 'text-align: start',
      'background-color: rgba(0, 0, 0, 0)', 'box-shadow: none', 'transform: none',
      'font-weight: 400', 'line-height: normal', 'letter-spacing: normal', 'z-index: auto',
      'width: auto', 'min-width: 0px', 'max-width: none', 'cursor: auto', 'overflow: visible',
      'justify-content: normal', 'align-items: normal', 'grid-template-columns: none',
      'gap: normal', 'box-sizing: content-box', 'top: auto', 'flex-basis: auto',
      'text-decoration: none solid rgb(0, 0, 0)', 'transition: all 0s ease 0s', 'filter: none',
      'border-radius: 0px',
    ].join('; '));
    expect(result).toEqual({ classes: [], unmapped: [] });
  });

  it('returns empty results for empty input', () => {
    expect(toTailwind([])).toEqual({ classes: [], unmapped: [] });
  });
});

describe('layout', () => {
  it('maps display values', () => {
    const cases: Array<[string, string]> = [
      ['block', 'block'], ['inline-block', 'inline-block'], ['flex', 'flex'], ['inline-flex', 'inline-flex'],
      ['grid', 'grid'], ['inline-grid', 'inline-grid'], ['contents', 'contents'], ['table', 'table'],
      ['list-item', 'list-item'], ['flow-root', 'flow-root'], ['none', 'hidden'],
    ];
    for (const [value, cls] of cases) expect(classes(`display: ${value}`)).toEqual([cls]);
  });

  it('maps position and inset offsets', () => {
    expect(classes(`position: absolute; ${four('%', '0px')}`)).toEqual(['absolute', 'inset-0']);
    expect(classes('position: relative; top: 13px; left: 16px; bottom: auto')).toEqual(['relative', 'top-[13px]', 'left-4']);
    expect(classes('position: sticky; top: -8px')).toEqual(['sticky', '-top-2']);
  });

  it('maps z-index to the scale or arbitrary values', () => {
    expect(classes('z-index: 10')).toEqual(['z-10']);
    expect(classes('z-index: 1000')).toEqual(['z-[1000]']);
  });

  it('collapses overflow when both axes match', () => {
    expect(classes('overflow: hidden; overflow-x: hidden; overflow-y: hidden')).toEqual(['overflow-hidden']);
    expect(classes('overflow-x: auto; overflow-y: hidden')).toEqual(['overflow-x-auto', 'overflow-y-hidden']);
    expect(classes('overflow-x: scroll')).toEqual(['overflow-x-scroll']);
  });

  it('maps box-sizing and visibility', () => {
    expect(classes('box-sizing: border-box; visibility: hidden')).toEqual(['box-border', 'invisible']);
  });
});

describe('flexbox', () => {
  it('maps a flex container with gap', () => {
    const css = 'display: flex; flex-direction: column; flex-wrap: wrap; justify-content: space-between; '
      + 'align-items: center; gap: 16px; row-gap: 16px; column-gap: 16px';
    expect(tw(css)).toEqual({
      classes: ['flex', 'flex-col', 'flex-wrap', 'justify-between', 'items-center', 'gap-4'],
      unmapped: [],
    });
  });

  it('maps flex item properties', () => {
    expect(classes('flex-grow: 1; flex-shrink: 0; flex-basis: 0%; align-self: center; order: 2'))
      .toEqual(['self-center', 'grow', 'shrink-0', 'basis-0', 'order-2']);
  });

  it('maps basis, order and alignment variants', () => {
    expect(classes('flex-basis: 16px')).toEqual(['basis-4']);
    expect(classes('flex-basis: 13px')).toEqual(['basis-[13px]']);
    expect(classes('order: -9999')).toEqual(['order-first']);
    expect(classes('order: 9999')).toEqual(['order-last']);
    expect(classes('order: 20')).toEqual(['order-[20]']);
    expect(classes('justify-content: flex-start')).toEqual(['justify-start']);
    expect(classes('justify-content: end')).toEqual(['justify-end']);
    expect(classes('align-items: flex-end')).toEqual(['items-end']);
    expect(classes('align-content: space-around')).toEqual(['content-around']);
    expect(classes('flex-direction: row-reverse')).toEqual(['flex-row-reverse']);
  });

  it('splits unequal gaps into x and y', () => {
    expect(classes('row-gap: 8px; column-gap: 13px')).toEqual(['gap-x-[13px]', 'gap-y-2']);
  });
});

describe('grid', () => {
  it('maps repeat templates to grid-cols-N and grid-rows-N', () => {
    expect(classes('display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0px, 1fr))'))
      .toEqual(['grid', 'grid-cols-3', 'grid-rows-2']);
  });

  it('maps computed px track lists to arbitrary values', () => {
    expect(classes('grid-template-columns: 384px 384px 384px')).toEqual(['grid-cols-[384px_384px_384px]']);
  });

  it('maps grid-auto-flow', () => {
    expect(classes('grid-auto-flow: column')).toEqual(['grid-flow-col']);
    expect(classes('grid-auto-flow: column dense')).toEqual(['grid-flow-col-dense']);
    expect(classes('grid-auto-flow: row dense')).toEqual(['grid-flow-row-dense']);
  });

  it('maps grid-column and grid-row placement', () => {
    expect(classes('grid-column: span 2 / span 2')).toEqual(['col-span-2']);
    expect(classes('grid-column: 1 / 3')).toEqual(['col-start-1', 'col-end-3']);
    expect(classes('grid-column: 1 / -1')).toEqual(['col-span-full']);
    expect(classes('grid-row: span 3 / span 3')).toEqual(['row-span-3']);
    expect(tw('grid-column: main-start / main-end')).toEqual({
      classes: [], unmapped: [{ prop: 'grid-column', value: 'main-start / main-end' }],
    });
  });
});

describe('spacing', () => {
  it('collapses four equal sides', () => {
    expect(classes(four('padding-%', '16px'))).toEqual(['p-4']);
  });

  it('collapses matching axes into x and y', () => {
    const css = 'padding-top: 16px; padding-right: 8px; padding-bottom: 16px; padding-left: 8px';
    expect(classes(css)).toEqual(['px-2', 'py-4']);
    expect(classes('margin-top: 0px; margin-right: auto; margin-bottom: 0px; margin-left: auto')).toEqual(['mx-auto']);
  });

  it('emits only non-zero sides when sides differ', () => {
    expect(classes('padding-top: 4px; padding-right: 0px; padding-bottom: 12px; padding-left: 0px')).toEqual(['pt-1', 'pb-3']);
  });

  it('uses the scale when possible and arbitrary px otherwise', () => {
    expect(classes('margin-top: 13px')).toEqual(['mt-[13px]']);
    expect(classes('padding: 12.5px')).toEqual(['p-[12.5px]']);
    expect(classes('margin-top: 12.333px')).toEqual(['mt-[12.33px]']);
    expect(classes(four('margin-%', '384px'))).toEqual(['m-96']);
  });

  it('maps negative margins', () => {
    expect(classes('margin-top: -8px; margin-left: -13px')).toEqual(['-mt-2', 'ml-[-13px]']);
  });
});

describe('sizing', () => {
  it('maps width, height, min and max', () => {
    expect(classes('width: 384px; height: 100%; min-width: 0px; max-width: 640px; min-height: 100vh; max-height: none'))
      .toEqual(['w-96', 'h-full', 'min-h-screen', 'max-w-[640px]']);
  });

  it('maps arbitrary, screen, intrinsic and full sizes', () => {
    expect(classes('width: 13px')).toEqual(['w-[13px]']);
    expect(classes('width: 100vw')).toEqual(['w-screen']);
    expect(classes('height: 100vh')).toEqual(['h-screen']);
    expect(classes('width: fit-content')).toEqual(['w-fit']);
    expect(classes('height: max-content')).toEqual(['h-max']);
    expect(classes('max-width: 100%')).toEqual(['max-w-full']);
  });
});

describe('typography', () => {
  it('maps font sizes to names or arbitrary px', () => {
    expect(classes('font-size: 12px')).toEqual(['text-xs']);
    expect(classes('font-size: 30px')).toEqual(['text-3xl']);
    expect(classes('font-size: 13px')).toEqual(['text-[13px]']);
  });

  it('maps font weights', () => {
    expect(classes('font-weight: 700')).toEqual(['font-bold']);
    expect(classes('font-weight: 100')).toEqual(['font-thin']);
    expect(classes('font-weight: 450')).toEqual(['font-[450]']);
    expect(classes('font-weight: 400')).toEqual([]);
  });

  it('formats font-family as an arbitrary value', () => {
    expect(classes('font-family: "Inter", system-ui, sans-serif')).toEqual(['font-[Inter,system-ui,sans-serif]']);
    expect(classes('font-family: "Helvetica Neue", Arial')).toEqual(['font-[Helvetica_Neue,Arial]']);
  });

  it('keeps line-height alongside a named font size, and maps tracking', () => {
    expect(classes('font-size: 16px; line-height: 24px')).toEqual(['text-base', 'leading-6']);
    expect(classes('line-height: 22px')).toEqual(['leading-[22px]']);
    expect(classes('letter-spacing: 0.5px')).toEqual(['tracking-[0.5px]']);
  });

  it('maps style, alignment, transform, decoration and white-space', () => {
    expect(classes('font-style: italic; text-align: center; text-transform: uppercase; text-decoration-line: underline; white-space: nowrap'))
      .toEqual(['italic', 'text-center', 'uppercase', 'underline', 'whitespace-nowrap']);
    expect(classes('text-align: end')).toEqual(['text-end']);
    expect(classes('text-decoration: line-through solid rgb(0, 0, 0)')).toEqual(['line-through']);
    expect(classes('white-space: pre-wrap')).toEqual(['whitespace-pre-wrap']);
  });
});

describe('colors', () => {
  it('maps white and black', () => {
    expect(classes('color: rgb(255, 255, 255); background-color: rgb(0, 0, 0)')).toEqual(['text-white', 'bg-black']);
  });

  it('maps transparent text but skips a transparent background', () => {
    expect(tw('color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0)')).toEqual({
      classes: ['text-transparent'], unmapped: [],
    });
  });

  it('maps opaque colours to hex and translucent ones to rgba', () => {
    expect(classes('color: rgb(224, 49, 49)')).toEqual(['text-[#e03131]']);
    expect(classes('background-color: rgba(224, 49, 49, 0.5)')).toEqual(['bg-[rgba(224,49,49,0.5)]']);
  });

  it('passes other colour syntaxes through as arbitrary values', () => {
    expect(classes('color: oklch(0.7 0.1 200)')).toEqual(['text-[oklch(0.7_0.1_200)]']);
    expect(classes('background-color: color(srgb 1 0 0)')).toEqual(['bg-[color(srgb_1_0_0)]']);
  });
});

describe('borders', () => {
  it('maps an equal border width and colour together', () => {
    const css = [four('border-%-width', '1px'), four('border-%-style', 'solid'), four('border-%-color', 'rgb(204, 204, 204)')].join('; ');
    expect(tw(css)).toEqual({ classes: ['border', 'border-[#cccccc]'], unmapped: [] });
  });

  it('ignores border colour and style when the width is zero', () => {
    const css = [four('border-%-width', '0px'), four('border-%-style', 'none'), four('border-%-color', 'rgb(0, 0, 0)')].join('; ');
    expect(tw(css)).toEqual({ classes: [], unmapped: [] });
  });

  it('maps named, arbitrary and dashed all-side borders', () => {
    expect(classes(`${four('border-%-width', '2px')}; ${four('border-%-style', 'dashed')}`)).toEqual(['border-2', 'border-dashed']);
    expect(classes(four('border-%-width', '8px'))).toEqual(['border-8']);
    expect(classes(four('border-%-width', '3px'))).toEqual(['border-[3px]']);
  });

  it('emits per-side widths and colours when sides differ', () => {
    const css = 'border-top-width: 1px; border-right-width: 0px; border-bottom-width: 2px; border-left-width: 3px; '
      + 'border-top-color: rgb(255, 255, 255); border-right-color: rgb(1, 2, 3); '
      + 'border-bottom-color: rgb(0, 0, 0); border-left-color: rgb(224, 49, 49)';
    expect(tw(css)).toEqual({
      classes: ['border-t', 'border-b-2', 'border-l-[3px]', 'border-t-white', 'border-b-black', 'border-l-[#e03131]'],
      unmapped: [],
    });
  });

  it('maps radius names, full and arbitrary values', () => {
    const cases: Array<[string, string]> = [
      ['2px', 'rounded-sm'], ['4px', 'rounded'], ['6px', 'rounded-md'], ['8px', 'rounded-lg'],
      ['12px', 'rounded-xl'], ['16px', 'rounded-2xl'], ['24px', 'rounded-3xl'], ['9999px', 'rounded-full'],
      ['50%', 'rounded-full'], ['10px', 'rounded-[10px]'],
    ];
    for (const [value, cls] of cases) expect(classes(`border-radius: ${value}`)).toEqual([cls]);
  });

  it('collapses equal corner longhands and splits unequal ones', () => {
    expect(classes('border-top-left-radius: 8px; border-top-right-radius: 8px; border-bottom-right-radius: 8px; border-bottom-left-radius: 8px'))
      .toEqual(['rounded-lg']);
    expect(classes('border-top-left-radius: 8px; border-top-right-radius: 8px; border-bottom-right-radius: 0px; border-bottom-left-radius: 0px'))
      .toEqual(['rounded-tl-lg', 'rounded-tr-lg']);
  });
});

describe('effects', () => {
  it('maps opacity to the 5-step scale or arbitrary values', () => {
    expect(classes('opacity: 0.5')).toEqual(['opacity-50']);
    expect(classes('opacity: 0')).toEqual(['opacity-0']);
    expect(classes('opacity: 0.37')).toEqual(['opacity-[0.37]']);
  });

  it('maps box-shadow and cursor', () => {
    expect(classes('box-shadow: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px')).toEqual(['shadow-[rgba(0,0,0,0.1)_0px_1px_2px_0px]']);
    expect(classes('cursor: pointer')).toEqual(['cursor-pointer']);
    expect(classes('cursor: not-allowed')).toEqual(['cursor-not-allowed']);
  });
});

describe('unmapped', () => {
  it('reports unsupported declarations with their prop and value unchanged', () => {
    const result = tw('display: flex; transform: matrix(0.7, 0.7, -0.7, 0.7, 0, 0); filter: blur(2px); transition: opacity 0.2s ease 0s; cursor: url(hand.png), auto');
    expect(result.classes).toEqual(['flex']);
    expect(result.unmapped).toEqual([
      { prop: 'transform', value: 'matrix(0.7, 0.7, -0.7, 0.7, 0, 0)' },
      { prop: 'filter', value: 'blur(2px)' },
      { prop: 'transition', value: 'opacity 0.2s ease 0s' },
      { prop: 'cursor', value: 'url(hand.png), auto' },
    ]);
  });

  it('reports recognised properties with values it cannot map', () => {
    expect(tw('display: ruby; font-size: 1.2em')).toEqual({
      classes: [],
      unmapped: [{ prop: 'display', value: 'ruby' }, { prop: 'font-size', value: '1.2em' }],
    });
  });
});

describe('fixture: red pill', () => {
  it('maps the pill and skips the identity transform', () => {
    const result = tw(PILL);
    expect(result.classes).toEqual(expect.arrayContaining(['block', 'px-4', 'py-2', 'bg-[#e03131]', 'text-white', 'rounded', 'text-base']));
    expect(result).toEqual({
      classes: ['block', 'px-4', 'py-2', 'text-base', 'text-white', 'bg-[#e03131]', 'rounded'],
      unmapped: [],
    });
  });

  it('reports a non-identity transform on the pill', () => {
    const result = tw(PILL.replace('matrix(1, 0, 0, 1, 0, 0)', 'matrix(1, 0, 0, 1, 10, 0)'));
    expect(result.unmapped).toEqual([{ prop: 'transform', value: 'matrix(1, 0, 0, 1, 10, 0)' }]);
  });
});

describe('ordering and duplicates', () => {
  const MIXED = 'cursor: pointer; opacity: 0.5; border-radius: 8px; background-color: rgb(255, 255, 255); '
    + 'color: rgb(0, 0, 0); font-size: 14px; width: 100%; padding-top: 8px; padding-right: 8px; '
    + 'padding-bottom: 8px; padding-left: 8px; gap: 8px; align-items: center; position: relative; display: flex';

  it('orders classes by group regardless of input order', () => {
    const expected = ['flex', 'relative', 'items-center', 'p-2', 'gap-2', 'w-full', 'text-sm', 'text-black', 'bg-white', 'rounded-lg', 'opacity-50', 'cursor-pointer'];
    expect(toTailwind(decls(MIXED)).classes).toEqual(expected);
    expect(toTailwind(decls(MIXED).reverse()).classes).toEqual(expected);
  });

  it('never emits duplicate classes', () => {
    const result = tw(`${MIXED}; ${PILL}; padding-top: 8px; text-decoration-line: underline; text-decoration: underline solid rgb(0, 0, 0)`);
    expect(new Set(result.classes).size).toBe(result.classes.length);
    expect(result.classes.filter(c => c === 'underline')).toHaveLength(1);
  });

  it('uses the last value when a property repeats', () => {
    expect(classes('display: block; display: grid')).toEqual(['grid']);
  });
});

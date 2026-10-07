import { describe, it, expect } from 'vitest';
import {
  addStop, colorAt, defaultGradient, gradientCss, gradientDeclaration, gradientTailwind, moveStop, normalizeHex,
  removeStop, setAngle, setStopColor, setType, setShape, stopKey, widestGapMiddle, MAX_STOPS, type GradientState,
} from '../utils/gradient';
import { gradientFormHtml, stopLabel } from '../utils/gradient-form';
import { renderPanelHtml } from '../utils/panel-render';
import { gradientModel } from '../utils/color-panels';
import { getHoverTool } from '../utils/tools';

const base = (): GradientState => defaultGradient(['#ff0000', '#0000ff']);

describe('defaultGradient', () => {
  it('starts from the two latest picks, 90deg', () => {
    expect(gradientCss(base())).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  it('falls back to built-in colours and ignores unreadable history', () => {
    expect(defaultGradient([]).stops.map(s => s.color)).toEqual(['#4f46e5', '#06b6d4']);
    expect(defaultGradient(['not a colour', '#00ff00']).stops.map(s => s.color)).toEqual(['#00ff00', '#06b6d4']);
  });
});

describe('stops', () => {
  it('adds a stop in the colour the gradient already shows there, keeping the list sorted', () => {
    const added = addStop(base(), 50)!;
    expect(added.state.stops.map(s => [s.color, s.pos])).toEqual([['#ff0000', 0], ['#800080', 50], ['#0000ff', 100]]);
    expect(added.state.stops[1]!.id).toBe(added.id);
  });

  it('adds a stop with a given colour and clamps its position', () => {
    const added = addStop(base(), 140, '#00ff00')!;
    expect(added.state.stops.at(-1)).toMatchObject({ color: '#00ff00', pos: 100 });
  });

  it('stops adding at the maximum', () => {
    let state = base();
    while (state.stops.length < MAX_STOPS) state = addStop(state, 50)!.state;
    expect(addStop(state, 25)).toBeNull();
  });

  it('keeps at least two stops', () => {
    const state = base();
    expect(removeStop(state, state.stops[0]!.id)).toBe(state);
    const three = addStop(state, 50)!;
    expect(removeStop(three.state, three.id).stops).toHaveLength(2);
  });

  it('moves a stop past another and keeps its identity', () => {
    const { state, id: middle } = addStop(base(), 50)!;
    const first = state.stops[0]!.id;
    const moved = moveStop(state, first, 70);
    expect(moved.stops.map(s => s.id)).toEqual([middle, first, state.stops[2]!.id]);
    expect(moveStop(state, first, 120).stops.at(-1)!.pos).toBe(100);
    expect(moveStop(state, first, -5).stops[0]!.pos).toBe(0);
    expect(moveStop(state, first, 33.333).stops[0]!.pos).toBe(33.3);
  });

  it('keeps hard stops (equal positions) in their order', () => {
    let state = addStop(base(), 50, '#00ff00')!.state;
    state = addStop(state, 50, '#ffff00')!.state;
    expect(gradientCss(state)).toBe('linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #ffff00 50%, #0000ff 100%)');
  });

  it('sets a stop colour from any CSS colour and ignores junk', () => {
    const state = base();
    const id = state.stops[0]!.id;
    expect(setStopColor(state, id, 'rgb(0, 128, 0)').stops[0]!.color).toBe('#008000');
    expect(setStopColor(state, id, 'nope')).toBe(state);
    expect(normalizeHex('#FFF')).toBe('#ffffff');
  });
});

describe('colorAt', () => {
  it('blends between neighbouring stops and clamps outside them', () => {
    const { stops } = base();
    expect(colorAt(stops, 25)).toBe('#bf0040');
    expect(colorAt(stops, -10)).toBe('#ff0000');
    expect(colorAt(stops, 200)).toBe('#0000ff');
  });
});

describe('widestGapMiddle', () => {
  it('picks the middle of the biggest gap', () => {
    expect(widestGapMiddle(base().stops)).toBe(50);
    const s = addStop(base(), 20)!.state;
    expect(widestGapMiddle(s.stops)).toBe(60);
  });
});

describe('angle, type and shape', () => {
  it('wraps angles into 0–359', () => {
    expect(setAngle(base(), 450).angle).toBe(90);
    expect(setAngle(base(), -90).angle).toBe(270);
    expect(setAngle(base(), 360).angle).toBe(0);
    expect(setAngle(base(), NaN).angle).toBe(90);
  });

  it('writes a radial gradient with its shape and no angle', () => {
    const radial = setShape(setType(base(), 'radial'), 'ellipse');
    expect(gradientCss(radial)).toBe('radial-gradient(ellipse, #ff0000 0%, #0000ff 100%)');
    expect(gradientCss(setType(base(), 'radial'))).toBe('radial-gradient(circle, #ff0000 0%, #0000ff 100%)');
  });
});

describe('output', () => {
  it('copies as a declaration', () => {
    expect(gradientDeclaration(setAngle(base(), 45))).toBe('background-image: linear-gradient(45deg, #ff0000 0%, #0000ff 100%);');
  });

  it('copies as a Tailwind arbitrary value', () => {
    expect(gradientTailwind(base())).toBe('bg-[linear-gradient(90deg,#ff0000_0%,#0000ff_100%)]');
    expect(gradientTailwind(setType(base(), 'radial'))).toBe('bg-[radial-gradient(circle,#ff0000_0%,#0000ff_100%)]');
  });
});

describe('stopKey', () => {
  it('moves by one, ten with Shift, to the ends, and removes', () => {
    expect(stopKey('ArrowRight', false, 10)).toEqual({ pos: 11 });
    expect(stopKey('ArrowLeft', false, 10)).toEqual({ pos: 9 });
    expect(stopKey('ArrowUp', true, 10)).toEqual({ pos: 20 });
    expect(stopKey('ArrowDown', true, 5)).toEqual({ pos: 0 });
    expect(stopKey('PageUp', false, 95)).toEqual({ pos: 100 });
    expect(stopKey('Home', false, 40)).toEqual({ pos: 0 });
    expect(stopKey('End', false, 40)).toEqual({ pos: 100 });
    expect(stopKey('Delete', false, 40)).toEqual({ remove: true });
    expect(stopKey('Backspace', false, 40)).toEqual({ remove: true });
    expect(stopKey('a', false, 40)).toBeNull();
  });
});

describe('markup', () => {
  it('gives every stop a labelled, focusable slider with its value', () => {
    const state = base();
    const html = gradientFormHtml(state, ['#112233'], state.stops[0]!.id);
    expect(html).toContain('role="slider" tabindex="0"');
    expect(html).toContain('aria-label="Stop 1 of 2"');
    expect(html).toContain('aria-valuetext="#0000ff at 100%"');
    expect(html).toContain('data-gr-apply="#112233"');
    expect(stopLabel(state, state.stops[1]!)).toBe('Stop 2 of 2');
  });

  it('disables removal at two stops and Add at the maximum', () => {
    const html = gradientFormHtml(base(), [], 1);
    expect(html.match(/data-gr-remove="\d+"[^>]*disabled/g)).toHaveLength(2);
    let full = base();
    while (full.stops.length < MAX_STOPS) full = addStop(full, 50)!.state;
    expect(gradientFormHtml(full, [], 1)).toMatch(/data-gr-add disabled/);
  });

  it('shows the angle for linear and the shape for radial', () => {
    expect(gradientFormHtml(base(), [], 1)).toContain('data-gr-angle');
    const radial = gradientFormHtml(setType(base(), 'radial'), [], 1);
    expect(radial).toContain('data-gr-shape');
    expect(radial).not.toContain('data-gr-angle');
  });

  it('escapes colours it was handed', () => {
    const html = gradientFormHtml(base(), ['"><img src=x onerror=alert(1)>'], 1);
    expect(html).not.toContain('<img');
  });
});

describe('panel and tool wiring', () => {
  it('renders a host for the editor and offers the action on the Color Picker', () => {
    expect(renderPanelHtml(gradientModel(['#fff']))).toContain('data-dtp-gradient');
    expect(getHoverTool('color-picker').actions?.map(a => [a.id, a.key])).toContainEqual(['gradient', 'g']);
  });

  it('keeps single-key shortcuts unique per tool', () => {
    for (const tool of ['color-picker', 'rulers', 'css-inspect', 'font-detect']) {
      const keys = getHoverTool(tool).actions?.map(a => a.key) ?? [];
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

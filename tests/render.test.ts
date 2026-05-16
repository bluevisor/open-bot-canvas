import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Canvas } from '../src/Canvas.ts';
import { renderSvg } from '../src/render.ts';

describe('renderSvg', () => {
  it('renders an empty canvas with the default white background', () => {
    const canvas = new Canvas(3, 2);
    const svg = renderSvg(canvas);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /width="30" height="20"/);
    assert.match(svg, /viewBox="0 0 30 20"/);
    assert.match(svg, /shape-rendering="crispEdges"/);
    assert.match(svg, /<rect width="30" height="20" fill="#FFFFFF"\/>/);
    assert.equal(svg.endsWith('</svg>'), true);
    const pixelRects = svg.match(/<rect x=/g) ?? [];
    assert.equal(pixelRects.length, 0);
  });

  it('renders each painted pixel as a fill rect at the scaled position', () => {
    const canvas = new Canvas(4, 4);
    canvas.draw(0, 0, '#ff0000', 'a');
    canvas.draw(2, 1, '#00ff00', 'b');
    const svg = renderSvg(canvas, { pixelSize: 5 });
    assert.match(svg, /<rect x="0" y="0" width="5" height="5" fill="#ff0000"\/>/);
    assert.match(svg, /<rect x="10" y="5" width="5" height="5" fill="#00ff00"\/>/);
  });

  it('orders pixel rects deterministically (row-major) regardless of draw order', () => {
    const canvas = new Canvas(4, 4);
    canvas.draw(2, 1, '#00ff00', 'b');
    canvas.draw(0, 0, '#ff0000', 'a');
    canvas.draw(1, 0, '#0000ff', 'c');
    const svg = renderSvg(canvas, { pixelSize: 1 });
    const order = [...svg.matchAll(/fill="(#[0-9a-fA-F]+)"/g)]
      .map((m) => m[1])
      .filter((c) => c !== '#FFFFFF');
    assert.deepEqual(order, ['#ff0000', '#0000ff', '#00ff00']);
  });

  it('omits the background rect when background is null', () => {
    const canvas = new Canvas(2, 2);
    const svg = renderSvg(canvas, { background: null });
    assert.equal(/<rect width="20" height="20"/.test(svg), false);
  });

  it('uses pixelSize=1 to produce a tight one-svg-unit-per-pixel image', () => {
    const canvas = new Canvas(3, 2);
    const svg = renderSvg(canvas, { pixelSize: 1 });
    assert.match(svg, /width="3" height="2"/);
    assert.match(svg, /viewBox="0 0 3 2"/);
  });

  it('rejects non-positive or non-integer pixelSize', () => {
    const canvas = new Canvas(2, 2);
    assert.throws(() => renderSvg(canvas, { pixelSize: 0 }), /positive integer/);
    assert.throws(() => renderSvg(canvas, { pixelSize: -1 }), /positive integer/);
    assert.throws(() => renderSvg(canvas, { pixelSize: 1.5 }), /positive integer/);
    assert.throws(() => renderSvg(canvas, { pixelSize: Number.NaN }), /positive integer/);
  });

  it('escapes XML-significant characters in the background fill attribute', () => {
    const canvas = new Canvas(2, 2);
    const svg = renderSvg(canvas, { background: '<script>' });
    assert.match(svg, /fill="&lt;script&gt;"/);
    assert.equal(svg.includes('<script>'), false);
  });

  it('uses an arbitrary CSS color string as the background', () => {
    const canvas = new Canvas(1, 1);
    const svg = renderSvg(canvas, { background: 'rebeccapurple' });
    assert.match(svg, /<rect width="10" height="10" fill="rebeccapurple"\/>/);
  });
});

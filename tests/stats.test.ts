import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { CanvasSnapshot, Pixel } from '../src/Canvas.ts';
import { analyzeSnapshot } from '../src/stats.ts';

function pixel(overrides: Partial<Pixel> & Pick<Pixel, 'x' | 'y'>): Pixel {
  return {
    color: '#000000',
    author: 'bot',
    timestamp: 1,
    ...overrides,
  };
}

function snapshot(pixels: Pixel[] = []): CanvasSnapshot {
  return { width: 5, height: 4, pixels };
}

describe('analyzeSnapshot', () => {
  it('summarizes coverage, bounds, colors, and authors', () => {
    const stats = analyzeSnapshot(
      snapshot([
        pixel({ x: 3, y: 1, color: '#ffffff', author: 'zeta' }),
        pixel({ x: 1, y: 2, color: '#000000', author: 'alpha' }),
        pixel({ x: 4, y: 3, color: '#ffffff', author: 'alpha' }),
      ]),
    );

    assert.equal(stats.area, 20);
    assert.equal(stats.paintedPixels, 3);
    assert.equal(stats.emptyPixels, 17);
    assert.equal(stats.fillRatio, 3 / 20);
    assert.deepEqual(stats.bounds, { minX: 1, minY: 1, maxX: 4, maxY: 3 });
    assert.deepEqual(stats.colors, [
      { color: '#ffffff', pixels: 2 },
      { color: '#000000', pixels: 1 },
    ]);
    assert.deepEqual(stats.authors, [
      { author: 'alpha', pixels: 2 },
      { author: 'zeta', pixels: 1 },
    ]);
  });

  it('returns empty rankings and null bounds for a blank canvas', () => {
    const stats = analyzeSnapshot(snapshot());

    assert.equal(stats.paintedPixels, 0);
    assert.equal(stats.emptyPixels, 20);
    assert.equal(stats.fillRatio, 0);
    assert.equal(stats.bounds, null);
    assert.deepEqual(stats.colors, []);
    assert.deepEqual(stats.authors, []);
  });

  it('sorts equal-count rankings alphabetically for deterministic output', () => {
    const stats = analyzeSnapshot(
      snapshot([
        pixel({ x: 0, y: 0, color: '#bbbbbb', author: 'bravo' }),
        pixel({ x: 1, y: 0, color: '#aaaaaa', author: 'alpha' }),
      ]),
    );

    assert.deepEqual(
      stats.colors.map((entry) => entry.color),
      ['#aaaaaa', '#bbbbbb'],
    );
    assert.deepEqual(
      stats.authors.map((entry) => entry.author),
      ['alpha', 'bravo'],
    );
  });

  it('rejects malformed snapshots', () => {
    assert.throws(() => analyzeSnapshot({ width: 0, height: 4, pixels: [] }), /positive integer/);
    assert.throws(() => analyzeSnapshot(snapshot([pixel({ x: 5, y: 0 })])), /out of bounds/);
    assert.throws(
      () => analyzeSnapshot(snapshot([pixel({ x: 1, y: 1 }), pixel({ x: 1, y: 1, timestamp: 2 })])),
      /duplicate pixel/,
    );
    assert.throws(
      () => analyzeSnapshot(snapshot([pixel({ x: 1, y: 1, timestamp: Number.NaN })])),
      /invalid timestamp/,
    );
  });
});

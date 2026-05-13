import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { CanvasSnapshot, Pixel } from '../src/Canvas.ts';
import { cropSnapshot } from '../src/region.ts';

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

describe('cropSnapshot', () => {
  it('returns a translated deterministic snapshot for pixels inside the region', () => {
    const cropped = cropSnapshot(
      snapshot([
        pixel({ x: 4, y: 3, color: '#outside' }),
        pixel({ x: 3, y: 2, color: '#333333', author: 'c', timestamp: 3 }),
        pixel({ x: 1, y: 1, color: '#111111', author: 'a', timestamp: 1 }),
        pixel({ x: 2, y: 1, color: '#222222', author: 'b', timestamp: 2 }),
      ]),
      { x: 1, y: 1, width: 3, height: 2 },
    );

    assert.deepEqual(cropped, {
      width: 3,
      height: 2,
      pixels: [
        pixel({ x: 0, y: 0, color: '#111111', author: 'a', timestamp: 1 }),
        pixel({ x: 1, y: 0, color: '#222222', author: 'b', timestamp: 2 }),
        pixel({ x: 2, y: 1, color: '#333333', author: 'c', timestamp: 3 }),
      ],
    });
  });

  it('does not mutate source pixel objects', () => {
    const sourcePixel = pixel({ x: 2, y: 2, color: '#abcdef' });
    const cropped = cropSnapshot(snapshot([sourcePixel]), { x: 2, y: 2, width: 1, height: 1 });
    const croppedPixel = cropped.pixels[0];
    assert.ok(croppedPixel);

    croppedPixel.color = '#000000';

    assert.equal(sourcePixel.x, 2);
    assert.equal(sourcePixel.y, 2);
    assert.equal(sourcePixel.color, '#abcdef');
  });

  it('returns an empty pixel list when no pixels fall inside the region', () => {
    const cropped = cropSnapshot(snapshot([pixel({ x: 0, y: 0 })]), {
      x: 3,
      y: 2,
      width: 2,
      height: 2,
    });

    assert.deepEqual(cropped, { width: 2, height: 2, pixels: [] });
  });

  it('rejects invalid regions', () => {
    assert.throws(() => cropSnapshot(snapshot(), { x: -1, y: 0, width: 1, height: 1 }), /inside/);
    assert.throws(() => cropSnapshot(snapshot(), { x: 0, y: 0, width: 0, height: 1 }), /positive/);
    assert.throws(() => cropSnapshot(snapshot(), { x: 0.5, y: 0, width: 1, height: 1 }), /integer/);
    assert.throws(() => cropSnapshot(snapshot(), { x: 4, y: 0, width: 2, height: 1 }), /exceeds/);
  });

  it('rejects malformed snapshot dimensions', () => {
    assert.throws(
      () => cropSnapshot({ width: 0, height: 4, pixels: [] }, { x: 0, y: 0, width: 1, height: 1 }),
      /Snapshot dimensions/,
    );
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { CanvasSnapshot, Pixel } from '../src/Canvas.ts';
import { applyPatch, diffSnapshots, invertPatch } from '../src/diff.ts';

function pixel(overrides: Partial<Pixel> & Pick<Pixel, 'x' | 'y'>): Pixel {
  return {
    color: '#000000',
    author: 'bot',
    timestamp: 1,
    ...overrides,
  };
}

function snapshot(pixels: Pixel[] = []): CanvasSnapshot {
  return { width: 4, height: 3, pixels };
}

describe('diffSnapshots', () => {
  it('returns no changes for equal snapshots', () => {
    const original = snapshot([pixel({ x: 1, y: 1, color: '#ffffff' })]);

    assert.deepEqual(diffSnapshots(original, original), {
      width: 4,
      height: 3,
      changes: [],
    });
  });

  it('reports added, updated, and removed pixels in row-major order', () => {
    const before = snapshot([
      pixel({ x: 3, y: 0, color: '#333333', author: 'old', timestamp: 1 }),
      pixel({ x: 0, y: 2, color: '#aaaaaa', author: 'gone', timestamp: 2 }),
    ]);
    const after = snapshot([
      pixel({ x: 1, y: 0, color: '#111111', author: 'new', timestamp: 3 }),
      pixel({ x: 3, y: 0, color: '#444444', author: 'newer', timestamp: 4 }),
    ]);

    const patch = diffSnapshots(before, after);

    assert.deepEqual(
      patch.changes.map((change) => [
        change.x,
        change.y,
        Boolean(change.before),
        Boolean(change.after),
      ]),
      [
        [1, 0, false, true],
        [3, 0, true, true],
        [0, 2, true, false],
      ],
    );
    assert.equal(patch.changes[1]?.before?.color, '#333333');
    assert.equal(patch.changes[1]?.after?.color, '#444444');
  });

  it('rejects snapshots with different dimensions', () => {
    assert.throws(
      () => diffSnapshots({ width: 1, height: 1, pixels: [] }, { width: 2, height: 1, pixels: [] }),
      /different dimensions/,
    );
  });

  it('rejects duplicate coordinates in either snapshot', () => {
    const duplicated = snapshot([pixel({ x: 0, y: 0 }), pixel({ x: 0, y: 0, timestamp: 2 })]);

    assert.throws(() => diffSnapshots(duplicated, snapshot()), /duplicate pixel/);
    assert.throws(() => diffSnapshots(snapshot(), duplicated), /duplicate pixel/);
  });
});

describe('applyPatch', () => {
  it('applies a diff patch and returns a deterministic snapshot', () => {
    const before = snapshot([
      pixel({ x: 3, y: 2, color: '#333333' }),
      pixel({ x: 0, y: 0, color: '#000000' }),
    ]);
    const after = snapshot([
      pixel({ x: 1, y: 1, color: '#111111' }),
      pixel({ x: 3, y: 2, color: '#ffffff', timestamp: 9 }),
    ]);

    const restored = applyPatch(before, diffSnapshots(before, after));

    assert.deepEqual(restored, after);
  });

  it('does not mutate the input snapshot or patch objects', () => {
    const before = snapshot([pixel({ x: 0, y: 0, color: '#000000' })]);
    const after = snapshot([pixel({ x: 0, y: 0, color: '#ffffff' })]);
    const patch = diffSnapshots(before, after);

    const restored = applyPatch(before, patch);
    const restoredPixel = restored.pixels[0];
    assert.ok(restoredPixel);
    restoredPixel.color = '#123456';

    assert.equal(before.pixels[0]?.color, '#000000');
    assert.equal(patch.changes[0]?.after?.color, '#ffffff');
  });

  it('rejects patches for a different canvas size', () => {
    assert.throws(
      () => applyPatch({ width: 2, height: 2, pixels: [] }, { width: 3, height: 2, changes: [] }),
      /do not match/,
    );
  });

  it('rejects stale patches when the before precondition no longer matches', () => {
    const patch = diffSnapshots(
      snapshot([pixel({ x: 0, y: 0, color: '#000000' })]),
      snapshot([pixel({ x: 0, y: 0, color: '#ffffff' })]),
    );

    assert.throws(
      () => applyPatch(snapshot([pixel({ x: 0, y: 0, color: '#222222' })]), patch),
      /precondition failed/,
    );
  });

  it('removes a pixel when a change has no after value', () => {
    const before = snapshot([pixel({ x: 2, y: 2, color: '#222222' })]);
    const after = applyPatch(before, {
      width: 4,
      height: 3,
      changes: [{ x: 2, y: 2, before: pixel({ x: 2, y: 2, color: '#222222' }) }],
    });

    assert.deepEqual(after.pixels, []);
  });

  it('rejects patch changes without a before or after pixel', () => {
    assert.throws(
      () => applyPatch(snapshot(), { width: 4, height: 3, changes: [{ x: 1, y: 1 }] }),
      /must include before or after/,
    );
  });

  it('rejects patch endpoints whose coordinates differ from the change coordinates', () => {
    assert.throws(
      () =>
        applyPatch(snapshot(), {
          width: 4,
          height: 3,
          changes: [{ x: 1, y: 1, after: pixel({ x: 2, y: 1 }) }],
        }),
      /has after pixel for \(2, 1\)/,
    );

    assert.throws(
      () =>
        applyPatch(snapshot([pixel({ x: 1, y: 1 })]), {
          width: 4,
          height: 3,
          changes: [{ x: 1, y: 1, before: pixel({ x: 1, y: 2 }) }],
        }),
      /has before pixel for \(1, 2\)/,
    );
  });
});

describe('invertPatch', () => {
  it('reverses a patch so an applied diff can be undone', () => {
    const before = snapshot([
      pixel({ x: 0, y: 0, color: '#000000', author: 'first', timestamp: 1 }),
      pixel({ x: 3, y: 2, color: '#333333', author: 'gone', timestamp: 2 }),
    ]);
    const after = snapshot([
      pixel({ x: 0, y: 0, color: '#ffffff', author: 'second', timestamp: 3 }),
      pixel({ x: 1, y: 1, color: '#111111', author: 'added', timestamp: 4 }),
    ]);

    const patch = diffSnapshots(before, after);
    const restored = applyPatch(after, invertPatch(patch));

    assert.deepEqual(restored, before);
  });

  it('does not share pixel objects with the original patch', () => {
    const original = diffSnapshots(
      snapshot([pixel({ x: 0, y: 0, color: '#000000' })]),
      snapshot([pixel({ x: 0, y: 0, color: '#ffffff' })]),
    );

    const inverted = invertPatch(original);
    const invertedAfter = inverted.changes[0]?.after;
    assert.ok(invertedAfter);
    invertedAfter.color = '#123456';

    assert.equal(original.changes[0]?.before?.color, '#000000');
  });

  it('preserves dimensions and reverses change order for safe replay', () => {
    const patch = diffSnapshots(
      snapshot([pixel({ x: 0, y: 0 }), pixel({ x: 1, y: 0 })]),
      snapshot([]),
    );

    const inverted = invertPatch(patch);

    assert.equal(inverted.width, 4);
    assert.equal(inverted.height, 3);
    assert.deepEqual(
      inverted.changes.map((change) => [change.x, change.y]),
      [
        [1, 0],
        [0, 0],
      ],
    );
  });
});

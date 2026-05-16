import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { CanvasSnapshot } from '../src/Canvas.ts';
import { snapshotFromJson, snapshotToJson } from '../src/snapshot-json.ts';

describe('snapshotToJson', () => {
  it('writes stable, row-major snapshot JSON with a trailing newline', () => {
    const snapshot: CanvasSnapshot = {
      width: 3,
      height: 2,
      pixels: [
        { x: 2, y: 1, color: '#222222', author: 'b', timestamp: 2 },
        { x: 0, y: 0, color: '#000000', author: 'a', timestamp: 1 },
      ],
    };

    const json = snapshotToJson(snapshot);

    assert.equal(json.endsWith('\n'), true);
    assert.deepEqual(
      JSON.parse(json).pixels.map((pixel: { x: number; y: number }) => [pixel.x, pixel.y]),
      [
        [0, 0],
        [2, 1],
      ],
    );
  });

  it('validates snapshots before writing', () => {
    assert.throws(
      () =>
        snapshotToJson({
          width: 1,
          height: 1,
          pixels: [{ x: 2, y: 0, color: '#fff', author: 'bot', timestamp: 1 }],
        }),
      /out of bounds/,
    );
  });
});

describe('snapshotFromJson', () => {
  it('parses and canonicalizes valid snapshot JSON', () => {
    const parsed = snapshotFromJson(
      JSON.stringify({
        width: 4,
        height: 3,
        pixels: [
          { x: 3, y: 2, color: '#333333', author: 'c', timestamp: 3 },
          { x: 1, y: 0, color: '#111111', author: 'a', timestamp: 1 },
        ],
      }),
    );

    assert.deepEqual(
      parsed.pixels.map((pixel) => [pixel.x, pixel.y]),
      [
        [1, 0],
        [3, 2],
      ],
    );
  });

  it('rejects invalid JSON with a snapshot-specific message', () => {
    assert.throws(() => snapshotFromJson('{'), /Invalid canvas snapshot JSON/);
  });

  it('rejects non-object top-level values', () => {
    assert.throws(() => snapshotFromJson('[]'), /top level/);
  });

  it('rejects malformed dimensions and pixels before canvas validation', () => {
    assert.throws(() => snapshotFromJson('{"width":0,"height":1,"pixels":[]}'), /width/);
    assert.throws(
      () => snapshotFromJson('{"width":1,"height":1,"pixels":[{"x":0}]}'),
      /integer coordinates/,
    );
    assert.throws(
      () =>
        snapshotFromJson(
          '{"width":1,"height":1,"pixels":[{"x":0,"y":0,"color":"#fff","author":"bot","timestamp":null}]}',
        ),
      /finite timestamp/,
    );
  });

  it('rejects duplicate or out-of-bounds pixels through canvas validation', () => {
    assert.throws(
      () =>
        snapshotFromJson(
          JSON.stringify({
            width: 2,
            height: 2,
            pixels: [
              { x: 1, y: 1, color: '#fff', author: 'a', timestamp: 1 },
              { x: 1, y: 1, color: '#000', author: 'b', timestamp: 2 },
            ],
          }),
        ),
      /duplicate pixel/,
    );
  });
});

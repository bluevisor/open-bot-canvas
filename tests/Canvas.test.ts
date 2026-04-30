import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { Canvas } from '../src/Canvas.ts';

describe('Canvas', () => {
  let canvas: Canvas;

  beforeEach(() => {
    canvas = new Canvas(10, 10);
  });

  it('initializes with given dimensions', () => {
    const { width, height } = canvas.getDimensions();
    assert.equal(width, 10);
    assert.equal(height, 10);
  });

  it('rejects non-integer or non-positive constructor dimensions', () => {
    assert.throws(() => new Canvas(0, 10), /positive integer/);
    assert.throws(() => new Canvas(10, -1), /positive integer/);
    assert.throws(() => new Canvas(1.5, 10), /positive integer/);
    assert.throws(() => new Canvas(Number.NaN, 10), /positive integer/);
  });

  it('draws a pixel at integer coordinates', () => {
    canvas.draw(1, 1, '#FF0000', 'bot-1');
    const pixel = canvas.getPixel(1, 1);
    assert.ok(pixel);
    assert.equal(pixel.color, '#FF0000');
    assert.equal(pixel.author, 'bot-1');
  });

  it('throws when drawing out of bounds', () => {
    assert.throws(() => canvas.draw(11, 11, '#000000', 'bot-1'), /out of bounds/);
    assert.throws(() => canvas.draw(-1, 0, '#000000', 'bot-1'), /out of bounds/);
  });

  it('throws when coordinates are not integers', () => {
    assert.throws(() => canvas.draw(Number.NaN, 0, '#000000', 'bot-1'), /must be integers/);
    assert.throws(() => canvas.draw(1.5, 0, '#000000', 'bot-1'), /must be integers/);
    assert.throws(
      () => canvas.draw(0, Number.POSITIVE_INFINITY, '#000000', 'bot-1'),
      /must be integers/,
    );
  });

  it('overwrites existing pixel', () => {
    canvas.draw(5, 5, '#000000', 'bot-1');
    canvas.draw(5, 5, '#FFFFFF', 'bot-2');
    const pixel = canvas.getPixel(5, 5);
    assert.equal(pixel?.color, '#FFFFFF');
    assert.equal(pixel?.author, 'bot-2');
  });

  it('returns all pixels', () => {
    canvas.draw(0, 0, '#111111', 'a');
    canvas.draw(1, 1, '#222222', 'b');
    assert.equal(canvas.getAllPixels().length, 2);
  });

  it('clears all pixels', () => {
    canvas.draw(0, 0, '#111111', 'a');
    canvas.clear();
    assert.equal(canvas.getAllPixels().length, 0);
  });

  it('returns defensive copies from getPixel so callers cannot mutate internal state', () => {
    canvas.draw(2, 3, '#abcdef', 'bot-1');
    const pixel = canvas.getPixel(2, 3);
    assert.ok(pixel);
    pixel.color = '#000000';
    pixel.author = 'tamper';
    const fresh = canvas.getPixel(2, 3);
    assert.equal(fresh?.color, '#abcdef');
    assert.equal(fresh?.author, 'bot-1');
  });

  it('returns defensive copies from getAllPixels', () => {
    canvas.draw(0, 0, '#111111', 'a');
    const all = canvas.getAllPixels();
    const first = all[0];
    assert.ok(first);
    first.color = '#999999';
    const fresh = canvas.getAllPixels()[0];
    assert.equal(fresh?.color, '#111111');
  });
});

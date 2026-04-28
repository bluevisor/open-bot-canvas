import { describe, it, expect, beforeEach } from 'vitest';
import { Canvas } from './Canvas.js';

describe('Canvas', () => {
  let canvas: Canvas;

  beforeEach(() => {
    canvas = new Canvas(10, 10);
  });

  it('should initialize with given dimensions', () => {
    const dimensions = canvas.getDimensions();
    expect(dimensions.width).toBe(10);
    expect(dimensions.height).toBe(10);
  });

  it('should allow drawing a pixel', () => {
    canvas.draw(1, 1, '#FF0000', 'bot-1');
    const pixel = canvas.getPixel(1, 1);
    expect(pixel).toBeDefined();
    expect(pixel?.color).toBe('#FF0000');
    expect(pixel?.author).toBe('bot-1');
  });

  it('should throw error when drawing out of bounds', () => {
    expect(() => canvas.draw(11, 11, '#000000', 'bot-1')).toThrow();
    expect(() => canvas.draw(-1, 0, '#000000', 'bot-1')).toThrow();
  });

  it('should overwrite existing pixel', () => {
    canvas.draw(5, 5, '#000000', 'bot-1');
    canvas.draw(5, 5, '#FFFFFF', 'bot-2');
    const pixel = canvas.getPixel(5, 5);
    expect(pixel?.color).toBe('#FFFFFF');
    expect(pixel?.author).toBe('bot-2');
  });

  it('should return all pixels', () => {
    canvas.draw(0, 0, '#111111', 'a');
    canvas.draw(1, 1, '#222222', 'b');
    const all = canvas.getAllPixels();
    expect(all.length).toBe(2);
  });

  it('should clear all pixels', () => {
    canvas.draw(0, 0, '#111111', 'a');
    canvas.clear();
    expect(canvas.getAllPixels().length).toBe(0);
  });
});

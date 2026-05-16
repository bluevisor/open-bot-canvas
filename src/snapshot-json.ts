import { Canvas } from './Canvas.ts';
import type { CanvasSnapshot, Pixel } from './Canvas.ts';

export function snapshotToJson(snapshot: CanvasSnapshot, space = 2): string {
  const canonical = Canvas.fromSnapshot(snapshot).toSnapshot();
  return `${JSON.stringify(canonical, null, space)}\n`;
}

export function snapshotFromJson(json: string): CanvasSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid canvas snapshot JSON: ${message}`);
  }

  return Canvas.fromSnapshot(assertSnapshotShape(parsed)).toSnapshot();
}

function assertSnapshotShape(value: unknown): CanvasSnapshot {
  if (!isRecord(value)) {
    throw new Error('Canvas snapshot JSON must contain an object at the top level');
  }

  const width = value.width;
  const height = value.height;
  const pixels = value.pixels;
  if (typeof width !== 'number' || !Number.isInteger(width) || width <= 0) {
    throw new Error(`Canvas snapshot width must be a positive integer, got ${String(width)}`);
  }
  if (typeof height !== 'number' || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Canvas snapshot height must be a positive integer, got ${String(height)}`);
  }
  if (!Array.isArray(pixels)) {
    throw new Error('Canvas snapshot pixels must be an array');
  }

  return {
    width,
    height,
    pixels: pixels.map((pixel, index) => assertPixelShape(pixel, index)),
  };
}

function assertPixelShape(value: unknown, index: number): Pixel {
  if (!isRecord(value)) {
    throw new Error(`Canvas snapshot pixel at index ${index} must be an object`);
  }

  const x = value.x;
  const y = value.y;
  const color = value.color;
  const author = value.author;
  const timestamp = value.timestamp;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    throw new Error(`Canvas snapshot pixel at index ${index} must have integer coordinates`);
  }
  if (typeof color !== 'string') {
    throw new Error(`Canvas snapshot pixel at index ${index} must have a string color`);
  }
  if (typeof author !== 'string') {
    throw new Error(`Canvas snapshot pixel at index ${index} must have a string author`);
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    throw new Error(`Canvas snapshot pixel at index ${index} must have a finite timestamp`);
  }

  return { x, y, color, author, timestamp };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

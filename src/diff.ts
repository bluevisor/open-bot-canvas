import type { CanvasSnapshot, Pixel } from './Canvas.ts';

export interface PixelChange {
  x: number;
  y: number;
  before?: Pixel;
  after?: Pixel;
}

export interface CanvasPatch {
  width: number;
  height: number;
  changes: PixelChange[];
}

export function diffSnapshots(before: CanvasSnapshot, after: CanvasSnapshot): CanvasPatch {
  assertSameDimensions(before, after);

  const beforePixels = indexPixels(before);
  const afterPixels = indexPixels(after);
  const keys = [...new Set([...beforePixels.keys(), ...afterPixels.keys()])].sort(compareKeys);
  const changes: PixelChange[] = [];

  for (const key of keys) {
    const previous = beforePixels.get(key);
    const next = afterPixels.get(key);
    if (pixelsEqual(previous, next)) continue;

    const pixel = next ?? previous;
    if (!pixel) continue;

    changes.push({
      x: pixel.x,
      y: pixel.y,
      ...(previous ? { before: { ...previous } } : {}),
      ...(next ? { after: { ...next } } : {}),
    });
  }

  return { width: after.width, height: after.height, changes };
}

export function applyPatch(snapshot: CanvasSnapshot, patch: CanvasPatch): CanvasSnapshot {
  if (snapshot.width !== patch.width || snapshot.height !== patch.height) {
    throw new Error(
      `Patch dimensions ${patch.width}x${patch.height} do not match snapshot dimensions ${snapshot.width}x${snapshot.height}`,
    );
  }

  const pixels = indexPixels(snapshot);
  for (const change of patch.changes) {
    assertInBounds(change.x, change.y, patch.width, patch.height);
    const key = keyFor(change.x, change.y);

    if (change.before) {
      const current = pixels.get(key);
      if (!pixelsEqual(current, change.before)) {
        throw new Error(`Patch precondition failed at (${change.x}, ${change.y})`);
      }
    }

    if (change.after) {
      pixels.set(key, { ...change.after });
    } else {
      pixels.delete(key);
    }
  }

  return {
    width: snapshot.width,
    height: snapshot.height,
    pixels: [...pixels.values()].sort(comparePixels).map((pixel) => ({ ...pixel })),
  };
}

function assertSameDimensions(before: CanvasSnapshot, after: CanvasSnapshot): void {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(
      `Cannot diff snapshots with different dimensions: ${before.width}x${before.height} vs ${after.width}x${after.height}`,
    );
  }
}

function indexPixels(snapshot: CanvasSnapshot): Map<string, Pixel> {
  const pixels = new Map<string, Pixel>();
  for (const pixel of snapshot.pixels) {
    assertInBounds(pixel.x, pixel.y, snapshot.width, snapshot.height);
    const key = keyFor(pixel.x, pixel.y);
    if (pixels.has(key)) {
      throw new Error(`Snapshot contains duplicate pixel at (${pixel.x}, ${pixel.y})`);
    }
    pixels.set(key, { ...pixel });
  }
  return pixels;
}

function assertInBounds(x: number, y: number, width: number, height: number): void {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Coordinates (${x}, ${y}) must be integers`);
  }
  if (x < 0 || x >= width || y < 0 || y >= height) {
    throw new Error(
      `Coordinates (${x}, ${y}) are out of bounds for canvas of size ${width}x${height}`,
    );
  }
}

function pixelsEqual(a: Pixel | undefined, b: Pixel | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.color === b.color &&
    a.author === b.author &&
    a.timestamp === b.timestamp
  );
}

function compareKeys(a: string, b: string): number {
  const [ax, ay] = parseKey(a);
  const [bx, by] = parseKey(b);
  return ay - by || ax - bx;
}

function comparePixels(a: Pixel, b: Pixel): number {
  return a.y - b.y || a.x - b.x;
}

function parseKey(key: string): [number, number] {
  const parts = key.split(',');
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (parts.length !== 2 || !Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Invalid pixel key: ${key}`);
  }
  return [x, y];
}

function keyFor(x: number, y: number): string {
  return `${x},${y}`;
}

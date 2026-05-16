import type { CanvasSnapshot, Pixel } from './Canvas.ts';

export interface ColorUsage {
  color: string;
  pixels: number;
}

export interface AuthorUsage {
  author: string;
  pixels: number;
}

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CanvasStats {
  width: number;
  height: number;
  area: number;
  paintedPixels: number;
  emptyPixels: number;
  fillRatio: number;
  bounds: CanvasBounds | null;
  colors: ColorUsage[];
  authors: AuthorUsage[];
}

export function analyzeSnapshot(snapshot: CanvasSnapshot): CanvasStats {
  assertPositiveInteger(snapshot.width, 'Canvas width');
  assertPositiveInteger(snapshot.height, 'Canvas height');
  if (!Array.isArray(snapshot.pixels)) {
    throw new Error('Canvas snapshot pixels must be an array');
  }

  const seen = new Set<string>();
  const colorCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  let bounds: CanvasBounds | null = null;

  for (const pixel of snapshot.pixels) {
    assertValidPixel(pixel, snapshot.width, snapshot.height);
    const key = `${pixel.x},${pixel.y}`;
    if (seen.has(key)) {
      throw new Error(`Canvas snapshot contains duplicate pixel at (${pixel.x}, ${pixel.y})`);
    }
    seen.add(key);

    colorCounts.set(pixel.color, (colorCounts.get(pixel.color) ?? 0) + 1);
    authorCounts.set(pixel.author, (authorCounts.get(pixel.author) ?? 0) + 1);
    bounds = expandBounds(bounds, pixel);
  }

  const area = snapshot.width * snapshot.height;
  const paintedPixels = snapshot.pixels.length;

  return {
    width: snapshot.width,
    height: snapshot.height,
    area,
    paintedPixels,
    emptyPixels: area - paintedPixels,
    fillRatio: paintedPixels / area,
    bounds,
    colors: rankCounts(colorCounts).map(([color, pixels]) => ({ color, pixels })),
    authors: rankCounts(authorCounts).map(([author, pixels]) => ({ author, pixels })),
  };
}

function expandBounds(bounds: CanvasBounds | null, pixel: Pixel): CanvasBounds {
  if (!bounds) {
    return { minX: pixel.x, minY: pixel.y, maxX: pixel.x, maxY: pixel.y };
  }
  return {
    minX: Math.min(bounds.minX, pixel.x),
    minY: Math.min(bounds.minY, pixel.y),
    maxX: Math.max(bounds.maxX, pixel.x),
    maxY: Math.max(bounds.maxY, pixel.y),
  };
}

function rankCounts(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function assertValidPixel(pixel: Pixel, width: number, height: number): void {
  if (!Number.isInteger(pixel.x) || !Number.isInteger(pixel.y)) {
    throw new Error(`Coordinates (${pixel.x}, ${pixel.y}) must be integers`);
  }
  if (pixel.x < 0 || pixel.x >= width || pixel.y < 0 || pixel.y >= height) {
    throw new Error(
      `Coordinates (${pixel.x}, ${pixel.y}) are out of bounds for canvas of size ${width}x${height}`,
    );
  }
  if (typeof pixel.color !== 'string') {
    throw new Error(`Pixel at (${pixel.x}, ${pixel.y}) has a non-string color`);
  }
  if (typeof pixel.author !== 'string') {
    throw new Error(`Pixel at (${pixel.x}, ${pixel.y}) has a non-string author`);
  }
  if (!Number.isFinite(pixel.timestamp)) {
    throw new Error(`Pixel at (${pixel.x}, ${pixel.y}) has an invalid timestamp`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`);
  }
}

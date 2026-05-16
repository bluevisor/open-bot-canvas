import type { CanvasSnapshot, Pixel } from './Canvas.ts';

export interface CanvasRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropSnapshot(snapshot: CanvasSnapshot, region: CanvasRegion): CanvasSnapshot {
  assertPositiveDimensions(snapshot.width, snapshot.height, 'Snapshot');
  assertValidRegion(snapshot, region);

  const pixels = snapshot.pixels
    .filter((pixel) => isInsideRegion(pixel, region))
    .map((pixel) => ({
      ...pixel,
      x: pixel.x - region.x,
      y: pixel.y - region.y,
    }))
    .sort(comparePixels);

  return {
    width: region.width,
    height: region.height,
    pixels,
  };
}

function assertValidRegion(snapshot: CanvasSnapshot, region: CanvasRegion): void {
  if (!Number.isInteger(region.x) || !Number.isInteger(region.y)) {
    throw new Error(`Region origin (${region.x}, ${region.y}) must use integer coordinates`);
  }
  if (region.x < 0 || region.y < 0) {
    throw new Error(`Region origin (${region.x}, ${region.y}) must be inside the snapshot`);
  }

  assertPositiveDimensions(region.width, region.height, 'Region');

  if (region.x + region.width > snapshot.width || region.y + region.height > snapshot.height) {
    throw new Error(
      `Region ${region.x},${region.y} ${region.width}x${region.height} exceeds snapshot size ${snapshot.width}x${snapshot.height}`,
    );
  }
}

function assertPositiveDimensions(width: number, height: number, label: string): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} dimensions must be positive integers, got ${width}x${height}`);
  }
}

function isInsideRegion(pixel: Pixel, region: CanvasRegion): boolean {
  return (
    pixel.x >= region.x &&
    pixel.x < region.x + region.width &&
    pixel.y >= region.y &&
    pixel.y < region.y + region.height
  );
}

function comparePixels(a: Pixel, b: Pixel): number {
  return a.y - b.y || a.x - b.x;
}

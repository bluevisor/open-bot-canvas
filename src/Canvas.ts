export interface Pixel {
  x: number;
  y: number;
  color: string;
  author: string;
  timestamp: number;
}

export interface CanvasSnapshot {
  width: number;
  height: number;
  pixels: Pixel[];
}

export class Canvas {
  private pixels: Map<string, Pixel> = new Map();
  private width: number;
  private height: number;

  constructor(width = 100, height = 100) {
    assertPositiveInteger(width, 'Canvas width');
    assertPositiveInteger(height, 'Canvas height');
    this.width = width;
    this.height = height;
  }

  public static fromSnapshot(snapshot: CanvasSnapshot): Canvas {
    const canvas = new Canvas(snapshot.width, snapshot.height);
    const seen = new Set<string>();

    if (!Array.isArray(snapshot.pixels)) {
      throw new Error('Canvas snapshot pixels must be an array');
    }

    for (const pixel of snapshot.pixels) {
      canvas.assertCoordinates(pixel.x, pixel.y);
      if (typeof pixel.color !== 'string') {
        throw new Error(`Pixel at (${pixel.x}, ${pixel.y}) has a non-string color`);
      }
      if (typeof pixel.author !== 'string') {
        throw new Error(`Pixel at (${pixel.x}, ${pixel.y}) has a non-string author`);
      }
      if (!Number.isFinite(pixel.timestamp)) {
        throw new Error(`Pixel at (${pixel.x}, ${pixel.y}) has an invalid timestamp`);
      }

      const key = keyFor(pixel.x, pixel.y);
      if (seen.has(key)) {
        throw new Error(`Canvas snapshot contains duplicate pixel at (${pixel.x}, ${pixel.y})`);
      }
      seen.add(key);
      canvas.pixels.set(key, { ...pixel });
    }

    return canvas;
  }

  public draw(x: number, y: number, color: string, author: string): void {
    this.assertCoordinates(x, y);

    this.pixels.set(keyFor(x, y), {
      x,
      y,
      color,
      author,
      timestamp: Date.now(),
    });
  }

  public getPixel(x: number, y: number): Pixel | undefined {
    const pixel = this.pixels.get(keyFor(x, y));
    return pixel && { ...pixel };
  }

  public getAllPixels(): Pixel[] {
    return Array.from(this.pixels.values(), (pixel) => ({ ...pixel }));
  }

  public getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public toSnapshot(): CanvasSnapshot {
    return {
      width: this.width,
      height: this.height,
      pixels: this.getAllPixels().sort((a, b) => a.y - b.y || a.x - b.x),
    };
  }

  public clear(): void {
    this.pixels.clear();
  }

  private assertCoordinates(x: number, y: number): void {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Coordinates (${x}, ${y}) must be integers`);
    }
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new Error(
        `Coordinates (${x}, ${y}) are out of bounds for canvas of size ${this.width}x${this.height}`,
      );
    }
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`);
  }
}

function keyFor(x: number, y: number): string {
  return `${x},${y}`;
}

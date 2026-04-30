export interface Pixel {
  x: number;
  y: number;
  color: string;
  author: string;
  timestamp: number;
}

export class Canvas {
  private pixels: Map<string, Pixel> = new Map();
  private width: number;
  private height: number;

  constructor(width = 100, height = 100) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`Canvas width must be a positive integer, got ${width}`);
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error(`Canvas height must be a positive integer, got ${height}`);
    }
    this.width = width;
    this.height = height;
  }

  public draw(x: number, y: number, color: string, author: string): void {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Coordinates (${x}, ${y}) must be integers`);
    }
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new Error(
        `Coordinates (${x}, ${y}) are out of bounds for canvas of size ${this.width}x${this.height}`,
      );
    }

    this.pixels.set(`${x},${y}`, {
      x,
      y,
      color,
      author,
      timestamp: Date.now(),
    });
  }

  public getPixel(x: number, y: number): Pixel | undefined {
    const pixel = this.pixels.get(`${x},${y}`);
    return pixel && { ...pixel };
  }

  public getAllPixels(): Pixel[] {
    return Array.from(this.pixels.values(), (pixel) => ({ ...pixel }));
  }

  public getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public clear(): void {
    this.pixels.clear();
  }
}

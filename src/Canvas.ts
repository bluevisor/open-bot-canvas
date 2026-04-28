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

  constructor(width: number = 100, height: number = 100) {
    this.width = width;
    this.height = height;
  }

  public draw(x: number, y: number, color: string, author: string): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new Error(`Coordinates (${x}, ${y}) are out of bounds for canvas of size ${this.width}x${this.height}`);
    }

    const key = `${x},${y}`;
    this.pixels.set(key, {
      x,
      y,
      color,
      author,
      timestamp: Date.now(),
    });
  }

  public getPixel(x: number, y: number): Pixel | undefined {
    return this.pixels.get(`${x},${y}`);
  }

  public getAllPixels(): Pixel[] {
    return Array.from(this.pixels.values());
  }

  public getDimensions() {
    return { width: this.width, height: this.height };
  }

  public clear(): void {
    this.pixels.clear();
  }
}

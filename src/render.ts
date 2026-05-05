import type { Canvas } from './Canvas.ts';

export interface SvgOptions {
  pixelSize?: number;
  background?: string | null;
}

const DEFAULT_PIXEL_SIZE = 10;
const DEFAULT_BACKGROUND = '#FFFFFF';

export function renderSvg(canvas: Canvas, options: SvgOptions = {}): string {
  const pixelSize = options.pixelSize ?? DEFAULT_PIXEL_SIZE;
  if (!Number.isInteger(pixelSize) || pixelSize <= 0) {
    throw new Error(`pixelSize must be a positive integer, got ${pixelSize}`);
  }

  const background = options.background === undefined ? DEFAULT_BACKGROUND : options.background;
  const { width, height } = canvas.getDimensions();
  const w = width * pixelSize;
  const h = height * pixelSize;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`,
  );
  if (background !== null) {
    parts.push(`<rect width="${w}" height="${h}" fill="${escapeAttr(background)}"/>`);
  }

  const pixels = canvas.getAllPixels();
  pixels.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  for (const pixel of pixels) {
    const x = pixel.x * pixelSize;
    const y = pixel.y * pixelSize;
    parts.push(
      `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${escapeAttr(pixel.color)}"/>`,
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

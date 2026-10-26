// The ground the terrarium grows on. A wrapping value-noise field is cut into
// lakes, lowland loam, plain soil, and bare rock, so every world seed lays
// down a different landscape — and the same seed lays down the same one, cell
// for cell.
//
// The cuts are quantiles, not fixed elevations: raw noise over a coarse
// lattice is lumpy enough that a fixed sea level drowns one seed and deserts
// the next. Slicing by share of cells keeps every world habitable while
// leaving its shape entirely up to the seed.

import type { Diet } from './genome.ts';
import type { Rng } from './rng.ts';

export type Terrain = 'water' | 'loam' | 'soil' | 'rock';

/** Coarse lattice spacing, in cells. Larger values make broader landforms. */
const LATTICE_SPACING = 8;

/** Share of the world that is water, and share that is bare rock. */
export const WATER_SHARE = 0.16;
export const ROCK_SHARE = 0.12;
/** Share of the remaining land, lowest-lying first, that is fertile loam. */
export const LOAM_SHARE = 0.25;

export interface TerrainOptions {
  waterShare?: number;
  rockShare?: number;
  loamShare?: number;
}

/**
 * How readily plants take root, as a share of growth events. Loam draws twice
 * the growth of plain soil; rock and water grow nothing at all.
 */
export function fertility(terrain: Terrain): number {
  switch (terrain) {
    case 'loam':
      return 2;
    case 'soil':
      return 1;
    default:
      return 0;
  }
}

/**
 * Nothing walks on water. Rock is climbable only by herbivores — broken
 * ground is refuge for something small and light, and a wall to a predator
 * built for the chase. It grows nothing, so cover is paid for in hunger.
 */
export function isPassable(terrain: Terrain, diet: Diet): boolean {
  if (terrain === 'water') return false;
  return terrain !== 'rock' || diet === 'herbivore';
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise on a wrapping lattice, sampled per cell. Wrapping matters: the
 * world is a torus, so a creature walking off the east edge must find the
 * same shoreline it left on the west.
 */
function elevationField(width: number, height: number, rng: Rng): number[] {
  const cols = Math.max(2, Math.round(width / LATTICE_SPACING));
  const rows = Math.max(2, Math.round(height / LATTICE_SPACING));
  const lattice = Array.from({ length: cols * rows }, () => rng());
  const corner = (cx: number, cy: number): number => lattice[(cy % rows) * cols + (cx % cols)] ?? 0;

  const field = new Array<number>(width * height);
  for (let y = 0; y < height; y++) {
    const gy = (y / height) * rows;
    const y0 = Math.floor(gy);
    const ty = smoothstep(gy - y0);
    for (let x = 0; x < width; x++) {
      const gx = (x / width) * cols;
      const x0 = Math.floor(gx);
      const tx = smoothstep(gx - x0);
      const top = corner(x0, y0) * (1 - tx) + corner(x0 + 1, y0) * tx;
      const bottom = corner(x0, y0 + 1) * (1 - tx) + corner(x0 + 1, y0 + 1) * tx;
      field[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return field;
}

/** Elevation below which `share` of the world lies. */
function quantile(sorted: readonly number[], share: number): number {
  if (share <= 0) return Number.NEGATIVE_INFINITY;
  if (share >= 1) return Number.POSITIVE_INFINITY;
  const index = Math.min(sorted.length - 1, Math.floor(share * sorted.length));
  return sorted[index] ?? Number.POSITIVE_INFINITY;
}

function checkShare(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`${name} must be in [0, 1), got ${value}`);
  }
}

/**
 * Generate a terrain map, row-major. Consumes the world's own Rng, so terrain
 * is part of the same deterministic stream as everything else.
 */
export function generateTerrain(
  width: number,
  height: number,
  rng: Rng,
  opts: TerrainOptions = {},
): Terrain[] {
  const waterShare = opts.waterShare ?? WATER_SHARE;
  const rockShare = opts.rockShare ?? ROCK_SHARE;
  const loamShare = opts.loamShare ?? LOAM_SHARE;
  checkShare('waterShare', waterShare);
  checkShare('rockShare', rockShare);
  checkShare('loamShare', loamShare);
  if (waterShare + rockShare >= 1) {
    throw new Error(`waterShare + rockShare must leave land, got ${waterShare + rockShare}`);
  }

  const field = elevationField(width, height, rng);
  const sorted = [...field].sort((a, b) => a - b);
  // A perfectly flat field (a world too small to carry the lattice) has no
  // quantiles worth cutting — it is simply all soil.
  if ((sorted.at(-1) ?? 0) === (sorted[0] ?? 0)) return field.map(() => 'soil');

  const waterCut = quantile(sorted, waterShare);
  const rockCut = quantile(sorted, 1 - rockShare);
  const loamCut = quantile(sorted, waterShare + loamShare * (1 - waterShare - rockShare));
  return field.map((elevation) => {
    if (elevation < waterCut) return 'water';
    if (elevation >= rockCut) return 'rock';
    return elevation < loamCut ? 'loam' : 'soil';
  });
}

/** Census of a terrain map, for tests and status lines. */
export function terrainCounts(terrain: readonly Terrain[]): Record<Terrain, number> {
  const counts: Record<Terrain, number> = { water: 0, loam: 0, soil: 0, rock: 0 };
  for (const cell of terrain) {
    counts[cell]++;
  }
  return counts;
}

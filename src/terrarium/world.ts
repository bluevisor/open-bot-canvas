// The terrarium world: a toroidal grid of terrain, plants, and creatures.
// Every state change flows through the world's own Rng, so a world built from
// the same seeds and the same commits replays tick-for-tick identically.

import { type Diet, type Genome, type Traits, mutate, traitsOf } from './genome.ts';
import { type Rng, hashSeed, mulberry32, pickInt, pickOne } from './rng.ts';
import {
  type Terrain,
  type TerrainOptions,
  fertility,
  generateTerrain,
  isPassable,
} from './terrain.ts';

export const MAX_PLANT_GROWTH = 3;
export const PLANT_ENERGY = 15;
export const MAX_ENERGY = 250;
export const POPULATION_CAP = 600;
export const SPAWN_ENERGY = 100;
/** Fraction of cells that receive a plant-growth event each tick. */
export const REGROWTH_RATE = 0.02;
/** A full predator stops hunting, giving prey populations room to recover. */
export const PREDATOR_SATIATION = 170;
/** Most hunts fail — that margin is what keeps prey populations alive. */
export const KILL_CHANCE = 0.35;
/** Minimum age before breeding, damping boom-bust population swings.
 * Predators mature much later — their doubling time is what decides whether
 * a bloom overshoots and eats the world. */
export const BREEDING_AGE = 20;
export const PREDATOR_BREEDING_AGE = 60;
const MUTATION_CHANCE = 0.25;

export interface Creature {
  id: number;
  genome: Genome;
  traits: Traits;
  x: number;
  y: number;
  energy: number;
  age: number;
  generation: number;
  alive: boolean;
  /** Commit SHA for founders hatched from git history; unset for offspring. */
  founderSha: string | undefined;
  /** Human-readable origin, e.g. a commit subject line. */
  label: string | undefined;
}

export interface World {
  width: number;
  height: number;
  rng: Rng;
  /** Ground type per cell, row-major. Fixed for the world's lifetime. */
  terrain: Terrain[];
  /** Cell indices plants can grow on, repeated once per point of fertility. */
  growable: number[];
  /** Plant growth 0..MAX_PLANT_GROWTH per cell, row-major. */
  plants: number[];
  creatures: Creature[];
  /** Every founder ever hatched, kept even after death for the legend. */
  founders: Creature[];
  /** Fraction of cells receiving a plant-growth event each tick. */
  regrowthRate: number;
  nextId: number;
  tick: number;
  births: number;
  deaths: number;
  kills: number;
}

export interface SpawnOptions {
  x?: number;
  y?: number;
  energy?: number;
  generation?: number;
  founderSha?: string;
  label?: string;
}

export interface WorldOptions extends TerrainOptions {
  regrowthRate?: number;
}

export function createWorld(
  width: number,
  height: number,
  seed: string,
  opts: WorldOptions = {},
): World {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`World dimensions must be positive integers, got ${width}x${height}`);
  }
  const rng = mulberry32(hashSeed(seed));
  const terrain = generateTerrain(width, height, rng, opts);
  const plants = new Array<number>(width * height);
  // Growth events are drawn from this pool, so rain never falls on the lake
  // and loam — listed once per point of fertility — outgrows plain soil.
  const growable: number[] = [];
  for (let i = 0; i < plants.length; i++) {
    const soilFertility = fertility(terrain[i] ?? 'rock');
    for (let n = 0; n < soilFertility; n++) {
      growable.push(i);
    }
    plants[i] = soilFertility > 0 && rng() < 0.35 ? pickInt(rng, 1, 2) : 0;
  }
  return {
    width,
    height,
    rng,
    terrain,
    growable,
    plants,
    creatures: [],
    founders: [],
    regrowthRate: opts.regrowthRate ?? REGROWTH_RATE,
    nextId: 1,
    tick: 0,
    births: 0,
    deaths: 0,
    kills: 0,
  };
}

/** Rejection-sample a cell this diet can stand on; falls back to a scan. */
function randomHome(world: World, diet: Diet): { x: number; y: number } {
  for (let attempt = 0; attempt < 32; attempt++) {
    const x = pickInt(world.rng, 0, world.width - 1);
    const y = pickInt(world.rng, 0, world.height - 1);
    if (canEnter(world, x, y, diet)) return { x, y };
  }
  const idx = world.terrain.findIndex((cell) => isPassable(cell, diet));
  if (idx < 0) throw new Error(`World has nowhere a ${diet} can stand`);
  return { x: idx % world.width, y: Math.floor(idx / world.width) };
}

export function spawnCreature(world: World, genome: Genome, opts: SpawnOptions = {}): Creature {
  const traits = traitsOf(genome);
  const home = randomHome(world, traits.diet);
  const creature: Creature = {
    id: world.nextId++,
    genome,
    traits,
    x: opts.x ?? home.x,
    y: opts.y ?? home.y,
    energy: opts.energy ?? SPAWN_ENERGY,
    age: 0,
    generation: opts.generation ?? 0,
    alive: true,
    founderSha: opts.founderSha,
    label: opts.label,
  };
  world.creatures.push(creature);
  if (creature.founderSha) {
    world.founders.push(creature);
  }
  return creature;
}

function cellIndex(world: World, x: number, y: number): number {
  return y * world.width + x;
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** Shortest per-axis distance on the torus, as signed steps. */
function torusDelta(from: number, to: number, size: number): number {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function torusDistance(world: World, x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(torusDelta(x1, x2, world.width)) + Math.abs(torusDelta(y1, y2, world.height));
}

/** Terrain of a cell, wrapping around the torus. */
export function terrainAt(world: World, x: number, y: number): Terrain {
  return world.terrain[cellIndex(world, wrap(x, world.width), wrap(y, world.height))] ?? 'rock';
}

/** Can this diet stand here? Water stops everything; rock stops predators. */
export function canEnter(world: World, x: number, y: number, diet: Diet): boolean {
  return isPassable(terrainAt(world, x, y), diet);
}

/** Move one cell if the ground allows it; report whether the step landed. */
function tryStep(world: World, c: Creature, dx: number, dy: number): boolean {
  const x = wrap(c.x + dx, world.width);
  const y = wrap(c.y + dy, world.height);
  if (!canEnter(world, x, y, c.traits.diet)) return false;
  c.x = x;
  c.y = y;
  return true;
}

function stepToward(world: World, c: Creature, tx: number, ty: number): void {
  const dx = torusDelta(c.x, tx, world.width);
  const dy = torusDelta(c.y, ty, world.height);
  // Move along the dominant axis first; ties resolve horizontally so the
  // choice stays deterministic. A shoreline blocking the preferred axis
  // pushes the creature along the other one — crude coastal pathfinding.
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  const steps: ReadonlyArray<readonly [number, number]> = horizontalFirst
    ? [
        [Math.sign(dx), 0],
        [0, Math.sign(dy)],
      ]
    : [
        [0, Math.sign(dy)],
        [Math.sign(dx), 0],
      ];
  for (const [sx, sy] of steps) {
    if ((sx !== 0 || sy !== 0) && tryStep(world, c, sx, sy)) return;
  }
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Step in a random direction, trying the rest in order if the way is wet. */
function wander(world: World, c: Creature): void {
  const start = pickInt(world.rng, 0, DIRECTIONS.length - 1);
  for (let i = 0; i < DIRECTIONS.length; i++) {
    const [dx, dy] = DIRECTIONS[(start + i) % DIRECTIONS.length] ?? [0, 0];
    if (tryStep(world, c, dx, dy)) return;
  }
}

/** Nearest plant cell with any growth within the creature's sense range. */
function findPlant(world: World, c: Creature): { x: number; y: number } | null {
  const range = c.traits.senseRange;
  let best: { x: number; y: number } | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > range || dist >= bestDist) continue;
      const x = wrap(c.x + dx, world.width);
      const y = wrap(c.y + dy, world.height);
      if ((world.plants[cellIndex(world, x, y)] ?? 0) > 0) {
        best = { x, y };
        bestDist = dist;
      }
    }
  }
  return best;
}

/** Nearest living creature of the given diet within range, excluding self. */
function findNearest(world: World, self: Creature, diet: Diet, range: number): Creature | null {
  let best: Creature | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const other of world.creatures) {
    if (!other.alive || other.id === self.id || other.traits.diet !== diet) continue;
    const dist = torusDistance(world, self.x, self.y, other.x, other.y);
    if (dist <= range && dist < bestDist) {
      best = other;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Break for cover, or failing that for open ground away from the threat.
 * Checking every direction — not just the threat's dominant axis — is what
 * stops a shoreline from becoming a kill box: prey backed against water run
 * along the shore instead of into the predator. Ground the hunter cannot
 * climb beats raw distance, so rock outcrops work as refuges. Ties resolve in
 * DIRECTIONS order, so the choice stays deterministic.
 */
function stepAway(world: World, c: Creature, threat: Creature): void {
  const score = (x: number, y: number): number => {
    const refuge = canEnter(world, x, y, threat.traits.diet) ? 0 : 1;
    return refuge * 1000 + torusDistance(world, x, y, threat.x, threat.y);
  };
  let best: readonly [number, number] | null = null;
  let bestScore = score(c.x, c.y);
  for (const [dx, dy] of DIRECTIONS) {
    const x = wrap(c.x + dx, world.width);
    const y = wrap(c.y + dy, world.height);
    if (!canEnter(world, x, y, c.traits.diet)) continue;
    const candidate = score(x, y);
    if (candidate > bestScore) {
      best = [dx, dy];
      bestScore = candidate;
    }
  }
  // Nowhere better to stand: scramble and hope the pounce misses.
  if (!best) {
    wander(world, c);
    return;
  }
  tryStep(world, c, best[0], best[1]);
}

function eatPlant(world: World, c: Creature): boolean {
  const idx = cellIndex(world, c.x, c.y);
  const growth = world.plants[idx] ?? 0;
  if (growth <= 0) return false;
  world.plants[idx] = 0;
  c.energy = Math.min(MAX_ENERGY, c.energy + growth * PLANT_ENERGY);
  return true;
}

/** Add growth to a cell; barren ground refuses it. */
function growPlant(world: World, idx: number, amount: number): void {
  if (fertility(world.terrain[idx] ?? 'rock') <= 0) return;
  world.plants[idx] = Math.min(MAX_PLANT_GROWTH, (world.plants[idx] ?? 0) + amount);
}

function die(world: World, c: Creature): void {
  c.alive = false;
  world.deaths++;
  // A corpse feeds the soil — bare rock just bleaches it.
  growPlant(world, cellIndex(world, c.x, c.y), 2);
}

function actHerbivore(world: World, c: Creature): void {
  for (let step = 0; step < c.traits.speed; step++) {
    // Survival first: run from any predator in sensing distance.
    const threat = findNearest(world, c, 'predator', c.traits.senseRange);
    if (threat) {
      stepAway(world, c, threat);
      continue;
    }
    if (eatPlant(world, c)) return;
    const plant = findPlant(world, c);
    if (plant) {
      stepToward(world, c, plant.x, plant.y);
    } else {
      wander(world, c);
    }
  }
  eatPlant(world, c);
}

function actPredator(world: World, c: Creature): void {
  // Digest before hunting again.
  if (c.energy >= PREDATOR_SATIATION) return;
  for (let step = 0; step < c.traits.speed; step++) {
    const prey = findNearest(world, c, 'herbivore', c.traits.senseRange);
    if (!prey) {
      wander(world, c);
      continue;
    }
    if (torusDistance(world, c.x, c.y, prey.x, prey.y) <= 1) {
      if (world.rng() < KILL_CHANCE) {
        prey.alive = false;
        world.deaths++;
        world.kills++;
        c.energy = Math.min(MAX_ENERGY, c.energy + Math.floor(prey.energy / 2));
      } else {
        // The pounce misses and the prey scrambles clear.
        wander(world, prey);
      }
      return;
    }
    stepToward(world, c, prey.x, prey.y);
  }
}

function reproduce(world: World, parent: Creature): void {
  const aliveCount = world.creatures.reduce((n, c) => (c.alive ? n + 1 : n), 0);
  if (aliveCount >= POPULATION_CAP) return;
  const childEnergy = Math.floor(parent.energy / 2);
  parent.energy -= childEnergy;
  const genome = world.rng() < MUTATION_CHANCE ? mutate(parent.genome, world.rng) : parent.genome;
  const [dx, dy] = pickOne(world.rng, DIRECTIONS);
  // Offspring land beside the parent, or on top of it if that way is barred.
  const nx = wrap(parent.x + dx, world.width);
  const ny = wrap(parent.y + dy, world.height);
  const reachable = canEnter(world, nx, ny, parent.traits.diet);
  spawnCreature(world, genome, {
    x: reachable ? nx : parent.x,
    y: reachable ? ny : parent.y,
    energy: childEnergy,
    generation: parent.generation + 1,
  });
  world.births++;
}

export function stepWorld(world: World): void {
  world.tick++;

  const regrowthEvents = Math.ceil(world.plants.length * world.regrowthRate);
  for (let i = 0; i < regrowthEvents && world.growable.length > 0; i++) {
    growPlant(world, pickOne(world.rng, world.growable), 1);
  }

  // Iterate a snapshot in id order: creatures born this tick act next tick,
  // and a creature killed mid-tick simply stops acting.
  const actors = [...world.creatures];
  for (const c of actors) {
    if (!c.alive) continue;
    c.age++;
    c.energy -= c.traits.metabolism;
    if (c.energy <= 0 || c.age > c.traits.lifespan) {
      die(world, c);
      continue;
    }
    if (c.traits.diet === 'herbivore') {
      actHerbivore(world, c);
    } else {
      actPredator(world, c);
    }
    const breedingAge = c.traits.diet === 'predator' ? PREDATOR_BREEDING_AGE : BREEDING_AGE;
    if (c.age >= breedingAge && c.energy >= c.traits.fertility) {
      reproduce(world, c);
    }
  }

  world.creatures = world.creatures.filter((c) => c.alive);
}

export function aliveCreatures(world: World): Creature[] {
  return world.creatures.filter((c) => c.alive);
}

/** Stable snapshot of everything that evolves, for determinism checks. */
export function serializeWorld(world: World): string {
  return JSON.stringify({
    tick: world.tick,
    terrain: world.terrain,
    births: world.births,
    deaths: world.deaths,
    kills: world.kills,
    plants: world.plants,
    creatures: world.creatures.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      energy: c.energy,
      age: c.age,
      generation: c.generation,
      bytes: c.genome.bytes,
    })),
  });
}

// The terrarium world: a toroidal grid of plants and creatures. Every state
// change flows through the world's own Rng, so a world built from the same
// seeds and the same commits replays tick-for-tick identically.

import { type Diet, type Genome, type Traits, mutate, traitsOf } from './genome.ts';
import { type Rng, hashSeed, mulberry32, pickInt, pickOne } from './rng.ts';

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

export interface WorldOptions {
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
  const plants = new Array<number>(width * height);
  for (let i = 0; i < plants.length; i++) {
    plants[i] = rng() < 0.35 ? pickInt(rng, 1, 2) : 0;
  }
  return {
    width,
    height,
    rng,
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

export function spawnCreature(world: World, genome: Genome, opts: SpawnOptions = {}): Creature {
  const creature: Creature = {
    id: world.nextId++,
    genome,
    traits: traitsOf(genome),
    x: opts.x ?? pickInt(world.rng, 0, world.width - 1),
    y: opts.y ?? pickInt(world.rng, 0, world.height - 1),
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

function stepToward(world: World, c: Creature, tx: number, ty: number): void {
  const dx = torusDelta(c.x, tx, world.width);
  const dy = torusDelta(c.y, ty, world.height);
  // Move along the dominant axis first; ties resolve horizontally so the
  // choice stays deterministic.
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    c.x = wrap(c.x + Math.sign(dx), world.width);
  } else if (dy !== 0) {
    c.y = wrap(c.y + Math.sign(dy), world.height);
  }
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function wander(world: World, c: Creature): void {
  const [dx, dy] = pickOne(world.rng, DIRECTIONS);
  c.x = wrap(c.x + dx, world.width);
  c.y = wrap(c.y + dy, world.height);
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

function stepAway(world: World, c: Creature, tx: number, ty: number): void {
  const dx = torusDelta(c.x, tx, world.width);
  const dy = torusDelta(c.y, ty, world.height);
  // Retreat along the threat's dominant axis; a zero delta on both axes
  // (same cell) falls through to a random scramble.
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    c.x = wrap(c.x - Math.sign(dx), world.width);
  } else if (dy !== 0) {
    c.y = wrap(c.y - Math.sign(dy), world.height);
  } else {
    wander(world, c);
  }
}

function eatPlant(world: World, c: Creature): boolean {
  const idx = cellIndex(world, c.x, c.y);
  const growth = world.plants[idx] ?? 0;
  if (growth <= 0) return false;
  world.plants[idx] = 0;
  c.energy = Math.min(MAX_ENERGY, c.energy + growth * PLANT_ENERGY);
  return true;
}

function die(world: World, c: Creature): void {
  c.alive = false;
  world.deaths++;
  // A corpse feeds the soil.
  const idx = cellIndex(world, c.x, c.y);
  world.plants[idx] = Math.min(MAX_PLANT_GROWTH, (world.plants[idx] ?? 0) + 2);
}

function actHerbivore(world: World, c: Creature): void {
  for (let step = 0; step < c.traits.speed; step++) {
    // Survival first: run from any predator in sensing distance.
    const threat = findNearest(world, c, 'predator', c.traits.senseRange);
    if (threat) {
      stepAway(world, c, threat.x, threat.y);
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
  spawnCreature(world, genome, {
    x: wrap(parent.x + dx, world.width),
    y: wrap(parent.y + dy, world.height),
    energy: childEnergy,
    generation: parent.generation + 1,
  });
  world.births++;
}

export function stepWorld(world: World): void {
  world.tick++;

  const regrowthEvents = Math.ceil(world.plants.length * world.regrowthRate);
  for (let i = 0; i < regrowthEvents; i++) {
    const idx = pickInt(world.rng, 0, world.plants.length - 1);
    world.plants[idx] = Math.min(MAX_PLANT_GROWTH, (world.plants[idx] ?? 0) + 1);
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

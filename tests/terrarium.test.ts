import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { genomeFromSha, mutate, speciesName, traitsOf } from '../src/terrarium/genome.ts';
import { parseCommitLog } from '../src/terrarium/history.ts';
import { renderFrame } from '../src/terrarium/render.ts';
import { hashSeed, mulberry32, pickInt } from '../src/terrarium/rng.ts';
import {
  ROCK_SHARE,
  WATER_SHARE,
  fertility,
  generateTerrain,
  isPassable,
  terrainCounts,
} from '../src/terrarium/terrain.ts';
import {
  BREEDING_AGE,
  MAX_ENERGY,
  aliveCreatures,
  createWorld,
  serializeWorld,
  spawnCreature,
  stepWorld,
  terrainAt,
} from '../src/terrarium/world.ts';

const SHA_A = '7067e29c1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f';
const SHA_B = 'a632056f0e1d2c3b4a5968778695a4b3c2d1e0f9';
// Third byte below 32 decodes to a predator; see traitsOf.
const PREDATOR_SHA = '1122003344556677889900aabbccddee';

describe('rng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = mulberry32(hashSeed('open-bot-canvas'));
    const b = mulberry32(hashSeed('open-bot-canvas'));
    for (let i = 0; i < 100; i++) {
      assert.equal(a(), b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(hashSeed('seed-1'));
    const b = mulberry32(hashSeed('seed-2'));
    const streamA = Array.from({ length: 10 }, () => a());
    const streamB = Array.from({ length: 10 }, () => b());
    assert.notDeepEqual(streamA, streamB);
  });

  it('pickInt stays within inclusive bounds', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const n = pickInt(rng, 2, 6);
      assert.ok(n >= 2 && n <= 6);
    }
  });
});

describe('genome', () => {
  it('decodes a commit SHA into stable traits', () => {
    const t1 = traitsOf(genomeFromSha(SHA_A));
    const t2 = traitsOf(genomeFromSha(SHA_A));
    assert.deepEqual(t1, t2);
    assert.ok(t1.speed >= 1 && t1.speed <= 3);
    assert.ok(t1.senseRange >= 2 && t1.senseRange <= 6);
    assert.ok(t1.metabolism >= 1 && t1.metabolism <= 3);
    const fertilityBase = t1.diet === 'predator' ? 200 : 130;
    assert.ok(t1.fertility >= fertilityBase && t1.fertility <= fertilityBase + 70);
    assert.ok(t1.lifespan >= 240);
    assert.ok(['herbivore', 'predator'].includes(t1.diet));
    assert.equal(t1.glyph.length, 1);
  });

  it('gives different SHAs different genomes', () => {
    assert.notDeepEqual(genomeFromSha(SHA_A).bytes, genomeFromSha(SHA_B).bytes);
  });

  it('names species pronounceably and deterministically', () => {
    const name = speciesName(genomeFromSha(SHA_A));
    assert.equal(name, speciesName(genomeFromSha(SHA_A)));
    assert.match(name, /^[A-Z][a-z]+$/);
  });

  it('rejects strings that are not hex SHAs', () => {
    assert.throws(() => genomeFromSha('not-a-sha'));
    assert.throws(() => genomeFromSha('abc'));
  });

  it('mutate changes exactly one byte and leaves the original intact', () => {
    const original = genomeFromSha(SHA_A);
    const before = [...original.bytes];
    const rng = mulberry32(42);
    const mutant = mutate(original, rng);
    assert.deepEqual([...original.bytes], before);
    const diffs = mutant.bytes.filter((b, i) => b !== original.bytes[i]).length;
    assert.ok(diffs <= 1);
    assert.equal(mutant.bytes.length, original.bytes.length);
  });
});

describe('terrain', () => {
  it('lays down the same map for the same seed and a different one otherwise', () => {
    const a = generateTerrain(48, 20, mulberry32(hashSeed('shoreline')));
    const b = generateTerrain(48, 20, mulberry32(hashSeed('shoreline')));
    const c = generateTerrain(48, 20, mulberry32(hashSeed('other-shoreline')));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it('holds water and rock near their target shares whatever the seed', () => {
    for (const seed of ['one', 'two', 'three', 'four']) {
      const terrain = generateTerrain(64, 24, mulberry32(hashSeed(seed)));
      const counts = terrainCounts(terrain);
      const total = terrain.length;
      assert.ok(Math.abs(counts.water / total - WATER_SHARE) < 0.03, `water for ${seed}`);
      assert.ok(Math.abs(counts.rock / total - ROCK_SHARE) < 0.03, `rock for ${seed}`);
      assert.ok(counts.loam > 0 && counts.soil > 0, `land for ${seed}`);
    }
  });

  it('honours shares set to zero', () => {
    const counts = terrainCounts(
      generateTerrain(40, 20, mulberry32(1), { waterShare: 0, rockShare: 0 }),
    );
    assert.equal(counts.water, 0);
    assert.equal(counts.rock, 0);
  });

  it('rejects shares that leave no land', () => {
    assert.throws(() =>
      generateTerrain(20, 10, mulberry32(1), { waterShare: 0.6, rockShare: 0.5 }),
    );
    assert.throws(() => generateTerrain(20, 10, mulberry32(1), { waterShare: 1 }));
  });

  it('falls back to plain soil when the world is too small to shape', () => {
    assert.deepEqual(generateTerrain(1, 1, mulberry32(7)), ['soil']);
  });

  it('bars water to everything and rock to predators only', () => {
    assert.equal(isPassable('water', 'herbivore'), false);
    assert.equal(isPassable('water', 'predator'), false);
    assert.equal(isPassable('rock', 'herbivore'), true);
    assert.equal(isPassable('rock', 'predator'), false);
    assert.equal(isPassable('loam', 'predator'), true);
  });

  it('grows nothing on water or rock, and most on loam', () => {
    assert.equal(fertility('water'), 0);
    assert.equal(fertility('rock'), 0);
    assert.ok(fertility('loam') > fertility('soil'));
  });
});

describe('world', () => {
  function populatedWorld(seed: string) {
    const world = createWorld(32, 16, seed);
    spawnCreature(world, genomeFromSha(SHA_A), { founderSha: SHA_A });
    spawnCreature(world, genomeFromSha(SHA_B), { founderSha: SHA_B });
    return world;
  }

  it('replays identically from the same seed and founders', () => {
    const a = populatedWorld('replay');
    const b = populatedWorld('replay');
    for (let i = 0; i < 200; i++) {
      stepWorld(a);
      stepWorld(b);
    }
    assert.equal(serializeWorld(a), serializeWorld(b));
  });

  it('diverges for different seeds', () => {
    const a = populatedWorld('seed-x');
    const b = populatedWorld('seed-y');
    for (let i = 0; i < 50; i++) {
      stepWorld(a);
      stepWorld(b);
    }
    assert.notEqual(serializeWorld(a), serializeWorld(b));
  });

  it('starves creatures when there is nothing to eat', () => {
    const world = createWorld(16, 8, 'barren', { regrowthRate: 0 });
    world.plants.fill(0);
    spawnCreature(world, genomeFromSha(SHA_A), { energy: 10 });
    // Metabolism is at least 1/tick, so 10 energy cannot outlast 10 ticks.
    for (let i = 0; i < 11 && aliveCreatures(world).length > 0; i++) {
      stepWorld(world);
    }
    assert.equal(aliveCreatures(world).length, 0);
    assert.equal(world.deaths, 1);
  });

  it('reproduces once mature with energy above the fertility threshold', () => {
    const world = createWorld(16, 8, 'fertile');
    const parent = spawnCreature(world, genomeFromSha(SHA_A), { energy: MAX_ENERGY });
    // Keep the parent fed while it matures past BREEDING_AGE.
    for (let i = 0; i <= BREEDING_AGE && world.births === 0; i++) {
      world.plants.fill(3);
      parent.energy = MAX_ENERGY;
      stepWorld(world);
    }
    assert.equal(world.births, 1);
    const child = aliveCreatures(world).find((c) => c.generation === 1);
    assert.ok(child);
  });

  it('keeps every creature on ground its diet can walk', () => {
    const world = createWorld(48, 20, 'walkable');
    spawnCreature(world, genomeFromSha(SHA_A));
    spawnCreature(world, genomeFromSha(SHA_B));
    spawnCreature(world, genomeFromSha(PREDATOR_SHA));
    for (let i = 0; i < 300; i++) {
      stepWorld(world);
      for (const c of aliveCreatures(world)) {
        const ground = terrainAt(world, c.x, c.y);
        assert.notEqual(ground, 'water', `${c.traits.diet} in the water at tick ${i}`);
        if (c.traits.diet === 'predator') {
          assert.notEqual(ground, 'rock', `predator on rock at tick ${i}`);
        }
      }
    }
  });

  it('grows plants only where the ground is fertile', () => {
    const world = createWorld(40, 16, 'fertile-ground');
    spawnCreature(world, genomeFromSha(SHA_A));
    for (let i = 0; i < 200; i++) {
      stepWorld(world);
    }
    world.plants.forEach((growth, idx) => {
      if (growth > 0) {
        assert.ok(fertility(world.terrain[idx] ?? 'rock') > 0, `growth on ${world.terrain[idx]}`);
      }
    });
  });

  it('sends threatened prey onto rock the predator cannot climb', () => {
    const world = createWorld(9, 9, 'refuge', { waterShare: 0, rockShare: 0 });
    world.terrain.fill('soil');
    // Refuge to the south, open ground to the east: cover should win even
    // though running east puts the prey just as far from the hunter.
    world.terrain[5 * 9 + 4] = 'rock';
    const prey = spawnCreature(world, genomeFromSha(SHA_A), { x: 4, y: 4, energy: 200 });
    const hunter = spawnCreature(world, genomeFromSha(PREDATOR_SHA), { x: 2, y: 4, energy: 50 });
    assert.equal(prey.traits.diet, 'herbivore');
    assert.equal(hunter.traits.diet, 'predator');
    stepWorld(world);
    assert.equal(terrainAt(world, prey.x, prey.y), 'rock');
  });

  it('caps energy at MAX_ENERGY', () => {
    const world = createWorld(8, 8, 'feast');
    world.plants.fill(3);
    const c = spawnCreature(world, genomeFromSha(SHA_B), { energy: MAX_ENERGY - 1 });
    stepWorld(world);
    assert.ok(c.energy <= MAX_ENERGY);
  });
});

describe('render', () => {
  it('renders a frame with border, one row per cell row, and a status line', () => {
    const world = createWorld(20, 5, 'render');
    spawnCreature(world, genomeFromSha(SHA_A));
    const frame = renderFrame(world);
    const lines = frame.split('\n');
    assert.equal(lines.length, 5 + 3); // border + rows + border + status
    assert.match(lines.at(-1) ?? '', /tick 0 \| alive 1/);
  });

  it('draws water and rock beneath the living layer', () => {
    const world = createWorld(6, 2, 'terrain-render', { waterShare: 0, rockShare: 0 });
    world.terrain.fill('soil');
    world.plants.fill(0);
    world.terrain[0] = 'water';
    world.terrain[1] = 'rock';
    const firstRow = renderFrame(world).split('\n')[1] ?? '';
    assert.match(firstRow, /~/);
    assert.match(firstRow, /\^/);
  });
});

describe('history', () => {
  it('parses unit-separated git log output', () => {
    const output = `${SHA_A}\x1fAlice\x1ffeat: first\n${SHA_B}\x1fBob\x1ffix: second\n`;
    const commits = parseCommitLog(output);
    assert.equal(commits.length, 2);
    assert.deepEqual(commits[0], { sha: SHA_A, author: 'Alice', subject: 'feat: first' });
    assert.deepEqual(commits[1], { sha: SHA_B, author: 'Bob', subject: 'fix: second' });
  });

  it('skips blank and malformed lines', () => {
    const commits = parseCommitLog(`\n${SHA_A}\x1fAlice\x1fsubject\nnonsense\n`);
    assert.equal(commits.length, 1);
  });
});

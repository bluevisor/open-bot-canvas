// A commit SHA is a genome. Each merged commit hatches one creature whose
// body plan is decoded from the SHA's bytes, so the ecosystem is a direct
// expression of the repository's history.

import { type Rng, pickInt } from './rng.ts';

export interface Genome {
  /** Raw genome bytes, decoded from a commit SHA's hex pairs. */
  readonly bytes: readonly number[];
}

export type Diet = 'herbivore' | 'predator';

export interface Traits {
  /** Pronounceable species name, decoded from genome bytes. */
  name: string;
  /** Single character used to draw the creature. */
  glyph: string;
  /** xterm-256 color index. */
  color: number;
  diet: Diet;
  /** Grid steps per tick, 1–3. */
  speed: number;
  /** How far the creature can smell food, 2–6 cells. */
  senseRange: number;
  /** Energy burned per tick, 1–3. */
  metabolism: number;
  /** Energy required before the creature will reproduce. */
  fertility: number;
  /** Maximum age in ticks. */
  lifespan: number;
}

const HERBIVORE_GLYPHS = ['o', 'e', 'u', 'w', 'm', 'n', 's', 'c'] as const;
const PREDATOR_GLYPHS = ['X', 'K', 'V', 'Z', 'A', 'R'] as const;

// Bright, legible slice of the xterm-256 cube; avoids near-black rows.
const COLORS = [
  39, 45, 51, 69, 75, 81, 111, 117, 123, 141, 147, 159, 168, 171, 177, 183, 197, 203, 208, 214, 220,
  226, 190, 154, 118, 213, 99, 105,
] as const;

const SYLLABLES = [
  'ka',
  'ru',
  've',
  'mo',
  'ti',
  'sha',
  'len',
  'or',
  'ba',
  'qui',
  'ne',
  'zo',
  'fa',
  'mir',
  'ul',
  'pex',
  'da',
  'yl',
  'gro',
  'sen',
  'ix',
  'tha',
  'vu',
  'rel',
  'om',
  'ji',
  'kel',
  'na',
  'dro',
  'wis',
  'ep',
  'lu',
] as const;

const SHA_RE = /^[0-9a-f]+$/i;

export function genomeFromSha(sha: string): Genome {
  const hex = sha.trim().toLowerCase();
  if (hex.length < 16 || hex.length % 2 !== 0 || !SHA_RE.test(hex)) {
    throw new Error(`Genome requires an even-length hex string of at least 16 chars, got "${sha}"`);
  }
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return { bytes };
}

function byteAt(genome: Genome, index: number): number {
  return genome.bytes[index % genome.bytes.length] ?? 0;
}

/** Index a trait table by genome byte; tables are non-empty by construction. */
function pickTrait<T>(items: readonly T[], byte: number): T {
  const item = items[byte % items.length];
  if (item === undefined) {
    throw new Error('Trait table must not be empty');
  }
  return item;
}

export function speciesName(genome: Genome): string {
  const count = 2 + (byteAt(genome, 8) % 2);
  let name = '';
  for (let i = 0; i < count; i++) {
    name += pickTrait(SYLLABLES, byteAt(genome, 9 + i));
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function traitsOf(genome: Genome): Traits {
  // Roughly 1 in 8 genomes decode to predators — enough to prune the herd
  // without collapsing the food web.
  const diet: Diet = byteAt(genome, 2) < 32 ? 'predator' : 'herbivore';
  const glyphs = diet === 'predator' ? PREDATOR_GLYPHS : HERBIVORE_GLYPHS;
  return {
    name: speciesName(genome),
    glyph: pickTrait(glyphs, byteAt(genome, 0)),
    color: pickTrait(COLORS, byteAt(genome, 1)),
    diet,
    speed: 1 + (byteAt(genome, 3) % 3),
    senseRange: 2 + (byteAt(genome, 4) % 5),
    // Hunting is expensive: predators burn one extra energy per tick.
    metabolism: (diet === 'predator' ? 2 : 1) + (byteAt(genome, 5) % 3),
    // Predators must bank far more energy before breeding, or a good hunting
    // streak snowballs into a predator bloom that crashes the food web.
    fertility: (diet === 'predator' ? 200 : 130) + (byteAt(genome, 6) % 8) * 10,
    lifespan: 240 + (byteAt(genome, 7) % 10) * 60,
  };
}

/** Copy the genome, flipping one byte to a new random value. */
export function mutate(genome: Genome, rng: Rng): Genome {
  const bytes = [...genome.bytes];
  const index = pickInt(rng, 0, bytes.length - 1);
  bytes[index] = pickInt(rng, 0, 255);
  return { bytes };
}

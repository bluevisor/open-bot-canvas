// Deterministic randomness for the terrarium. The whole simulation must
// replay identically from git history, so nothing in src/terrarium may call
// Math.random or Date.now — all chance flows through an explicit Rng.

export type Rng = () => number;

/** FNV-1a 32-bit hash, used to turn arbitrary strings into PRNG seeds. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and stable across platforms. Returns [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [min, max], inclusive on both ends. */
export function pickInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element of a non-empty array. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  const item = items[pickInt(rng, 0, items.length - 1)];
  if (item === undefined) {
    throw new Error('pickOne requires a non-empty array');
  }
  return item;
}

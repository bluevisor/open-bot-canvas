// ANSI rendering for the terrarium. Pure string building — no terminal
// control here beyond color codes, so frames are easy to test and to pipe.

import type { Terrain } from './terrain.ts';
import { type Creature, type World, aliveCreatures } from './world.ts';

const RESET = '\x1b[0m';

// Plant growth 0..3 rendered as deepening green.
const PLANT_GLYPHS = [' ', '.', ',', '"'] as const;
const PLANT_COLORS = [0, 22, 28, 34] as const;

// Bare ground, drawn under plants and creatures. Soil and loam are left blank
// so the living layer stays the thing you actually read.
const TERRAIN_GLYPHS: Record<Terrain, string> = { water: '~', rock: '^', soil: ' ', loam: ' ' };
const TERRAIN_COLORS: Record<Terrain, number> = { water: 24, rock: 244, soil: 0, loam: 0 };

function fg(color: number): string {
  return `\x1b[38;5;${color}m`;
}

export function renderFrame(world: World): string {
  const alive = aliveCreatures(world);
  const byCell = new Map<number, Creature>();
  for (const c of alive) {
    const idx = c.y * world.width + c.x;
    const existing = byCell.get(idx);
    // Predators draw over herbivores; otherwise highest energy wins.
    if (
      !existing ||
      (c.traits.diet === 'predator' && existing.traits.diet !== 'predator') ||
      (c.traits.diet === existing.traits.diet && c.energy > existing.energy)
    ) {
      byCell.set(idx, c);
    }
  }

  const rows: string[] = [];
  for (let y = 0; y < world.height; y++) {
    let row = '';
    for (let x = 0; x < world.width; x++) {
      const idx = y * world.width + x;
      const creature = byCell.get(idx);
      if (creature) {
        row += `${fg(creature.traits.color)}${creature.traits.glyph}${RESET}`;
        continue;
      }
      const growth = world.plants[idx] ?? 0;
      if (growth > 0) {
        row += `${fg(PLANT_COLORS[growth] ?? 0)}${PLANT_GLYPHS[growth] ?? ' '}${RESET}`;
        continue;
      }
      const terrain = world.terrain[idx] ?? 'soil';
      const glyph = TERRAIN_GLYPHS[terrain];
      row += glyph === ' ' ? ' ' : `${fg(TERRAIN_COLORS[terrain])}${glyph}${RESET}`;
    }
    rows.push(row);
  }

  const herbivores = alive.filter((c) => c.traits.diet === 'herbivore').length;
  const predators = alive.length - herbivores;
  const status =
    `tick ${world.tick} | alive ${alive.length} ` +
    `(${herbivores} herbivores, ${predators} predators) | ` +
    `births ${world.births} | deaths ${world.deaths} | kills ${world.kills}`;

  const border = `+${'-'.repeat(world.width)}+`;
  return [border, ...rows.map((r) => `|${r}|`), border, status].join('\n');
}

export function renderLegend(world: World): string {
  const lines = ['Founders (one creature per commit):'];
  for (const c of world.founders) {
    const t = c.traits;
    const glyph = `${fg(t.color)}${t.glyph}${RESET}`;
    const fate = c.alive ? 'alive' : `died at age ${c.age}`;
    const origin = c.label ? ` — ${c.label}` : '';
    lines.push(
      `  ${glyph} ${t.name} (${t.diet}, speed ${t.speed}, sense ${t.senseRange}, ${fate}) ` +
        `[${c.founderSha?.slice(0, 7)}]${origin}`,
    );
  }
  const descendants = aliveCreatures(world).filter((c) => !c.founderSha).length;
  if (descendants > 0) {
    lines.push(`  …plus ${descendants} living descendants.`);
  }
  return lines.join('\n');
}

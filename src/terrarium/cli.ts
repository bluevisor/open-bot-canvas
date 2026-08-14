// Entry point: hatch one creature per commit in this repository's history
// and let the ecosystem run. Same history + same seed → the same world,
// tick for tick.
//
//   pnpm world                 animate in the terminal
//   pnpm world --snapshot      run silently, print the final frame (CI-safe)
//   pnpm world --steps 800 --size 80x30 --seed anything

import { genomeFromSha } from './genome.ts';
import { readCommitHistory } from './history.ts';
import { renderFrame, renderLegend } from './render.ts';
import { type World, aliveCreatures, createWorld, spawnCreature, stepWorld } from './world.ts';

interface CliOptions {
  steps: number;
  fps: number;
  snapshot: boolean;
  width: number;
  height: number;
  seed: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    steps: 2000,
    fps: 15,
    snapshot: false,
    width: 64,
    height: 24,
    seed: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--steps':
        opts.steps = Number.parseInt(argv[++i] ?? '', 10);
        break;
      case '--fps':
        opts.fps = Number.parseInt(argv[++i] ?? '', 10);
        break;
      case '--snapshot':
        opts.snapshot = true;
        if (opts.steps === 2000) opts.steps = 500;
        break;
      case '--size': {
        const [w, h] = (argv[++i] ?? '').split('x').map((n) => Number.parseInt(n, 10));
        opts.width = w ?? Number.NaN;
        opts.height = h ?? Number.NaN;
        break;
      }
      case '--seed':
        opts.seed = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (
    !Number.isInteger(opts.steps) ||
    opts.steps <= 0 ||
    !Number.isInteger(opts.fps) ||
    opts.fps <= 0 ||
    !Number.isInteger(opts.width) ||
    opts.width <= 0 ||
    !Number.isInteger(opts.height) ||
    opts.height <= 0
  ) {
    throw new Error('steps, fps, and size must be positive integers');
  }
  return opts;
}

function buildWorld(opts: CliOptions): World {
  const commits = readCommitHistory();
  if (commits.length === 0) {
    throw new Error('No commits found — the terrarium grows from git history');
  }
  // The world's seed is the full lineage, so every merged PR reshapes the
  // replay without any state file.
  const seed = opts.seed ?? commits.map((c) => c.sha).join('');
  const world = createWorld(opts.width, opts.height, seed);
  for (const commit of commits) {
    spawnCreature(world, genomeFromSha(commit.sha), {
      founderSha: commit.sha,
      label: `${commit.subject} (${commit.author})`,
    });
  }
  return world;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CURSOR_HOME = '\x1b[H';
const CLEAR_SCREEN = '\x1b[2J';

async function animate(world: World, opts: CliOptions): Promise<void> {
  const frameMs = Math.round(1000 / opts.fps);
  const restore = () => process.stdout.write(SHOW_CURSOR);
  process.on('SIGINT', () => {
    restore();
    process.exit(0);
  });
  process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN);
  try {
    for (let i = 0; i < opts.steps; i++) {
      stepWorld(world);
      process.stdout.write(`${CURSOR_HOME}${renderFrame(world)}\n`);
      if (aliveCreatures(world).length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, frameMs));
    }
  } finally {
    restore();
  }
  process.stdout.write(`\n${renderLegend(world)}\n`);
}

function snapshot(world: World, opts: CliOptions): void {
  for (let i = 0; i < opts.steps; i++) {
    stepWorld(world);
    if (aliveCreatures(world).length === 0) break;
  }
  process.stdout.write(`${renderFrame(world)}\n\n${renderLegend(world)}\n`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const world = buildWorld(opts);
  if (opts.snapshot) {
    snapshot(world, opts);
  } else {
    await animate(world, opts);
  }
}

main().catch((err: unknown) => {
  process.stdout.write(SHOW_CURSOR);
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});

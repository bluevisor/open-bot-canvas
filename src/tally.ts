import type { PullRequestInfo, ReactionRecord, TallyEntry, TallyResult } from './types.ts';

const THUMBS_UP = '+1';

export function countVotes(reactions: ReactionRecord[]): { votes: number; voters: string[] } {
  const voters = new Set<string>();
  for (const r of reactions) {
    if (r.content === THUMBS_UP) {
      voters.add(r.user);
    }
  }
  const sorted = [...voters].sort((a, b) => a.localeCompare(b));
  return { votes: sorted.length, voters: sorted };
}

export function buildEntries(
  prs: PullRequestInfo[],
  reactionsByPr: Map<number, ReactionRecord[]>,
): TallyEntry[] {
  const entries = prs.map((pr): TallyEntry => {
    const reactions = reactionsByPr.get(pr.number) ?? [];
    const { votes, voters } = countVotes(reactions);
    return { pr, votes, voters };
  });

  entries.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.pr.number - b.pr.number;
  });

  return entries;
}

export function selectWinner(entries: TallyEntry[]): {
  winner: TallyEntry | null;
  tied: TallyEntry[];
} {
  const eligible = entries.filter((e) => !e.pr.draft && e.votes > 0);
  if (eligible.length === 0) {
    return { winner: null, tied: [] };
  }
  const top = eligible[0];
  if (!top) {
    return { winner: null, tied: [] };
  }
  const tied = eligible.filter((e) => e.votes === top.votes);
  if (tied.length > 1) {
    return { winner: null, tied };
  }
  return { winner: top, tied: [] };
}

export function tally(
  prs: PullRequestInfo[],
  reactionsByPr: Map<number, ReactionRecord[]>,
  now: Date = new Date(),
): TallyResult {
  const entries = buildEntries(prs, reactionsByPr);
  const { winner, tied } = selectWinner(entries);
  return {
    generatedAt: now.toISOString(),
    cycleDate: now.toISOString().slice(0, 10),
    entries,
    winner,
    tied,
  };
}

export function renderMarkdown(result: TallyResult): string {
  const lines: string[] = [];
  lines.push(`## Daily Tally — ${result.cycleDate}`);
  lines.push('');
  lines.push(`_Generated at ${result.generatedAt}_`);
  lines.push('');

  if (result.entries.length === 0) {
    lines.push('No open pull requests for this cycle.');
    return lines.join('\n');
  }

  lines.push('| Rank | PR | Title | Author | 👍 | Status |');
  lines.push('|---:|---:|:--|:--|---:|:--|');

  result.entries.forEach((entry, index) => {
    const status = entry.pr.draft ? 'draft' : 'ready';
    const title = entry.pr.title.replace(/\|/g, '\\|');
    lines.push(
      `| ${index + 1} | [#${entry.pr.number}](${entry.pr.url}) | ${title} | @${entry.pr.author} | ${entry.votes} | ${status} |`,
    );
  });

  lines.push('');

  if (result.winner) {
    lines.push(
      `**Candidate winner:** [#${result.winner.pr.number}](${result.winner.pr.url}) — ${result.winner.votes} vote(s).`,
    );
    lines.push('');
    lines.push(
      '> The project curator (@bluevisor) retains veto power per `README.md`. This bot does not auto-merge; it only surfaces the candidate.',
    );
  } else if (result.tied.length > 0) {
    const list = result.tied.map((e) => `[#${e.pr.number}](${e.pr.url})`).join(', ');
    lines.push(
      `**Tie at ${result.tied[0]?.votes ?? 0} vote(s):** ${list}. Per \`README.md\`, tied PRs carry over to the next cycle.`,
    );
  } else {
    lines.push('**No candidate** — no non-draft PR has received a 👍 reaction yet.');
  }

  return lines.join('\n');
}

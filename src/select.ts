import { VETO_LABEL } from './github.ts';
import { buildEntries, selectWinner } from './tally.ts';
import type {
  PullRequestInfo,
  ReactionRecord,
  SelectionOutcome,
  SelectionResult,
  TallyEntry,
} from './types.ts';

export function decideOutcome(
  prs: PullRequestInfo[],
  reactionsByPr: Map<number, ReactionRecord[]>,
  fresh: Map<number, PullRequestInfo>,
): SelectionOutcome {
  const entries = buildEntries(prs, reactionsByPr);
  const { winner, tied } = selectWinner(entries);

  if (!winner) {
    if (tied.length > 0) {
      const list = tied.map((e) => `#${e.pr.number}`).join(', ');
      return {
        kind: 'none',
        reason: `Tie at ${tied[0]?.votes ?? 0} vote(s) (${list}); carrying over.`,
      };
    }
    return { kind: 'none', reason: 'No non-draft PR received a 👍 reaction.' };
  }

  return classifyWinner(winner, fresh.get(winner.pr.number) ?? winner.pr);
}

function classifyWinner(winner: TallyEntry, current: PullRequestInfo): SelectionOutcome {
  if (current.labels.includes(VETO_LABEL)) {
    return { kind: 'vetoed', pr: current, reason: `PR carries the \`${VETO_LABEL}\` label.` };
  }
  if (current.draft) {
    return { kind: 'deferred', pr: current, reason: 'PR was converted to draft after the tally.' };
  }
  if (current.mergeable === false) {
    return {
      kind: 'deferred',
      pr: current,
      reason: `PR is not mergeable (state: ${current.mergeableState}).`,
    };
  }
  if (current.mergeableState === 'blocked' || current.mergeableState === 'dirty') {
    return {
      kind: 'deferred',
      pr: current,
      reason: `PR merge is blocked (state: ${current.mergeableState}).`,
    };
  }
  return {
    kind: 'merged',
    pr: current,
    sha: '',
  };
}

export function renderSelection(result: SelectionResult): string {
  const lines: string[] = [];
  lines.push(`## Cycle Selection — ${result.cycleDate}`);
  lines.push('');
  lines.push(`_Generated at ${result.generatedAt}_`);
  lines.push('');

  const o = result.outcome;
  switch (o.kind) {
    case 'merged':
      lines.push(`✅ **Merged** [#${o.pr.number}](${o.pr.url}) — ${escapeTitle(o.pr.title)}`);
      lines.push('');
      lines.push(`Squash commit: \`${o.sha.slice(0, 12)}\``);
      break;
    case 'vetoed':
      lines.push(`🛑 **Vetoed** [#${o.pr.number}](${o.pr.url}) — ${escapeTitle(o.pr.title)}`);
      lines.push('');
      lines.push(o.reason);
      break;
    case 'deferred':
      lines.push(`⏸️ **Deferred** [#${o.pr.number}](${o.pr.url}) — ${escapeTitle(o.pr.title)}`);
      lines.push('');
      lines.push(o.reason);
      break;
    case 'none':
      lines.push('➖ **No selection.**');
      lines.push('');
      lines.push(o.reason);
      break;
  }

  lines.push('');
  lines.push(
    '> Selection is automated per `README.md`. Add the `veto` label to a candidate PR to block the merge.',
  );
  return lines.join('\n');
}

function escapeTitle(title: string): string {
  return title.replace(/\|/g, '\\|');
}

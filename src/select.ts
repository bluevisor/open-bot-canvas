import { CANDIDATE_LABEL, VETO_LABEL } from './github.ts';
import type { PullRequestInfo, SelectionOutcome, SelectionResult } from './types.ts';

export function decideOutcome(candidate: PullRequestInfo | null): SelectionOutcome {
  if (!candidate) {
    return {
      kind: 'none',
      reason: `No PR carries the \`${CANDIDATE_LABEL}\` label. Either the previous cycle had no winner or the label was cleared.`,
    };
  }
  if (candidate.labels.includes(VETO_LABEL)) {
    return { kind: 'vetoed', pr: candidate, reason: `PR carries the \`${VETO_LABEL}\` label.` };
  }
  if (candidate.draft) {
    return {
      kind: 'deferred',
      pr: candidate,
      reason: 'PR was converted to draft after the tally.',
    };
  }
  if (candidate.mergeable === false) {
    return {
      kind: 'deferred',
      pr: candidate,
      reason: `PR is not mergeable (state: ${candidate.mergeableState}).`,
    };
  }
  if (candidate.mergeableState === 'dirty') {
    return {
      kind: 'deferred',
      pr: candidate,
      reason: `PR has merge conflicts (state: ${candidate.mergeableState}).`,
    };
  }
  return { kind: 'ready', pr: candidate };
}

export function renderSelection(result: SelectionResult): string {
  const lines: string[] = [];
  lines.push(`## Cycle Selection — ${result.cycleDate}`);
  lines.push('');
  lines.push(`_Generated at ${result.generatedAt}_`);
  lines.push('');

  const o = result.outcome;
  switch (o.kind) {
    case 'ready':
      lines.push(
        `✅ **Ready for merge** — [#${o.pr.number}](${o.pr.url}) — ${escapeTitle(o.pr.title)}`,
      );
      lines.push('');
      lines.push(
        'The candidate passed the veto window and is mergeable. The curator may merge it.',
      );
      break;
    case 'vetoed':
      lines.push(`🛑 **Vetoed** — [#${o.pr.number}](${o.pr.url}) — ${escapeTitle(o.pr.title)}`);
      lines.push('');
      lines.push(o.reason);
      break;
    case 'deferred':
      lines.push(`⏸️ **Deferred** — [#${o.pr.number}](${o.pr.url}) — ${escapeTitle(o.pr.title)}`);
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
    `> Selection is automated per \`README.md\`. Add the \`${VETO_LABEL}\` label to the candidate PR before the selector runs to block the merge. Merging is performed manually by the curator.`,
  );
  return lines.join('\n');
}

function escapeTitle(title: string): string {
  return title.replace(/\|/g, '\\|');
}

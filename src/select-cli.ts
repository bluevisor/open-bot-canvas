import { CANDIDATE_LABEL, GitHubClient } from './github.ts';
import { decideOutcome, renderSelection } from './select.ts';
import type { PullRequestInfo, SelectionResult } from './types.ts';

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const slug = process.env.GITHUB_REPOSITORY;
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!slug) throw new Error('GITHUB_REPOSITORY is required (format: owner/repo)');

  const client = GitHubClient.fromEnv(token, slug);

  const prs = await client.listOpenPullRequests();
  const labeled = prs.filter((pr) => pr.labels.includes(CANDIDATE_LABEL));

  let candidate: PullRequestInfo | null = null;
  if (labeled.length === 1) {
    candidate = await client.getPullRequest(labeled[0]?.number ?? 0);
  } else if (labeled.length > 1) {
    candidate = null;
  }

  const outcome =
    labeled.length > 1
      ? {
          kind: 'none' as const,
          reason: `Multiple PRs carry the \`${CANDIDATE_LABEL}\` label (${labeled.map((p) => `#${p.number}`).join(', ')}); refusing to guess.`,
        }
      : decideOutcome(candidate);

  const now = new Date();
  const result: SelectionResult = {
    cycleDate: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    outcome,
  };
  const markdown = renderSelection(result);

  if (dryRun) {
    process.stdout.write(`${markdown}\n`);
    return;
  }

  const issueNumber = await client.findOrCreateTallyIssue();
  await client.commentOnIssue(issueNumber, markdown);

  if (outcome.kind === 'vetoed' || outcome.kind === 'deferred') {
    await client.removeLabel(outcome.pr.number, CANDIDATE_LABEL);
  }

  process.stdout.write(`Posted selection to issue #${issueNumber}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});

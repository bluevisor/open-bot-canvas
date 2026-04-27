import { GitHubClient } from './github.ts';
import { decideOutcome, renderSelection } from './select.ts';
import type { PullRequestInfo, ReactionRecord, SelectionResult } from './types.ts';

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const slug = process.env.GITHUB_REPOSITORY;
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!slug) throw new Error('GITHUB_REPOSITORY is required (format: owner/repo)');

  const client = GitHubClient.fromEnv(token, slug);

  const prs = await client.listOpenPullRequests();
  const reactionsByPr = new Map<number, ReactionRecord[]>();
  const fresh = new Map<number, PullRequestInfo>();
  for (const pr of prs) {
    const reactions = await client.listReactionsForPullRequest(pr.number);
    reactionsByPr.set(pr.number, reactions);
  }

  let outcome = decideOutcome(prs, reactionsByPr, fresh);

  if (outcome.kind === 'merged') {
    const detailed = await client.getPullRequest(outcome.pr.number);
    fresh.set(detailed.number, detailed);
    outcome = decideOutcome(prs, reactionsByPr, fresh);
  }

  if (outcome.kind === 'merged' && !dryRun) {
    const sha = await client.mergePullRequest(
      outcome.pr.number,
      `${outcome.pr.title} (#${outcome.pr.number})`,
    );
    outcome = { ...outcome, sha };
  }

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
  process.stdout.write(`Posted selection to issue #${issueNumber}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});

import { GitHubClient } from './github.ts';
import { renderMarkdown, tally } from './tally.ts';
import type { ReactionRecord } from './types.ts';

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const slug = process.env.GITHUB_REPOSITORY;
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!slug) throw new Error('GITHUB_REPOSITORY is required (format: owner/repo)');

  const client = GitHubClient.fromEnv(token, slug);

  const prs = await client.listOpenPullRequests();
  const reactionsByPr = new Map<number, ReactionRecord[]>();
  for (const pr of prs) {
    const reactions = await client.listReactionsForPullRequest(pr.number);
    reactionsByPr.set(pr.number, reactions);
  }

  const result = tally(prs, reactionsByPr);
  const markdown = renderMarkdown(result);

  if (dryRun) {
    process.stdout.write(`${markdown}\n`);
    return;
  }

  const issueNumber = await client.findOrCreateTallyIssue();
  await client.commentOnIssue(issueNumber, markdown);

  if (result.winner) {
    await client.setCandidateLabel(result.winner.pr.number, prs);
  } else {
    await client.clearCandidateLabel(prs);
  }

  process.stdout.write(`Posted tally to issue #${issueNumber}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});

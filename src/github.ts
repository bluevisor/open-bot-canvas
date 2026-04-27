import { Octokit } from '@octokit/rest';
import type { PullRequestInfo, ReactionRecord } from './types.ts';

export interface RepoRef {
  owner: string;
  repo: string;
}

export const TALLY_ISSUE_LABEL = 'daily-tally';
export const TALLY_ISSUE_TITLE = 'Daily Tally Tracker';
export const VETO_LABEL = 'veto';
export const CANDIDATE_LABEL = 'cycle-candidate';
export const CURATOR_LOGIN = 'bluevisor';

export function parseRepo(slug: string): RepoRef {
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${slug}`);
  }
  return { owner, repo };
}

export class GitHubClient {
  constructor(
    private readonly octokit: Octokit,
    private readonly ref: RepoRef,
  ) {}

  static fromEnv(token: string, slug: string): GitHubClient {
    return new GitHubClient(new Octokit({ auth: token }), parseRepo(slug));
  }

  async listOpenPullRequests(): Promise<PullRequestInfo[]> {
    const prs = await this.octokit.paginate(this.octokit.pulls.list, {
      ...this.ref,
      state: 'open',
      per_page: 100,
    });

    return prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      url: pr.html_url,
      draft: pr.draft ?? false,
      labels: (pr.labels ?? []).map((l) => (typeof l === 'string' ? l : (l.name ?? ''))),
      mergeable: null,
      mergeableState: 'unknown',
    }));
  }

  async getPullRequest(prNumber: number): Promise<PullRequestInfo> {
    const { data: pr } = await this.octokit.pulls.get({ ...this.ref, pull_number: prNumber });
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      url: pr.html_url,
      draft: pr.draft ?? false,
      labels: pr.labels.map((l) => l.name ?? ''),
      mergeable: pr.mergeable ?? null,
      mergeableState: pr.mergeable_state ?? 'unknown',
    };
  }

  async setCandidateLabel(prNumber: number, openPrs: PullRequestInfo[]): Promise<void> {
    await this.ensureCandidateLabelExists();
    for (const pr of openPrs) {
      if (pr.number !== prNumber && pr.labels.includes(CANDIDATE_LABEL)) {
        await this.removeLabel(pr.number, CANDIDATE_LABEL);
      }
    }
    const target = openPrs.find((pr) => pr.number === prNumber);
    if (target && !target.labels.includes(CANDIDATE_LABEL)) {
      await this.octokit.issues.addLabels({
        ...this.ref,
        issue_number: prNumber,
        labels: [CANDIDATE_LABEL],
      });
    }
  }

  async clearCandidateLabel(openPrs: PullRequestInfo[]): Promise<void> {
    for (const pr of openPrs) {
      if (pr.labels.includes(CANDIDATE_LABEL)) {
        await this.removeLabel(pr.number, CANDIDATE_LABEL);
      }
    }
  }

  async removeLabel(prNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.removeLabel({
        ...this.ref,
        issue_number: prNumber,
        name: label,
      });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  private async ensureCandidateLabelExists(): Promise<void> {
    try {
      await this.octokit.issues.getLabel({ ...this.ref, name: CANDIDATE_LABEL });
    } catch (err) {
      if (isNotFound(err)) {
        await this.octokit.issues.createLabel({
          ...this.ref,
          name: CANDIDATE_LABEL,
          color: '0e8a16',
          description: 'Tallied winner for the current cycle, awaiting curator merge',
        });
        return;
      }
      throw err;
    }
  }

  async listReactionsForPullRequest(prNumber: number): Promise<ReactionRecord[]> {
    const reactions = await this.octokit.paginate(this.octokit.reactions.listForIssue, {
      ...this.ref,
      issue_number: prNumber,
      per_page: 100,
    });

    return reactions
      .filter((r) => r.user !== null)
      .map((r) => ({
        user: r.user?.login ?? 'unknown',
        content: r.content,
      }));
  }

  async findOrCreateTallyIssue(): Promise<number> {
    const existing = await this.octokit.paginate(this.octokit.issues.listForRepo, {
      ...this.ref,
      state: 'open',
      labels: TALLY_ISSUE_LABEL,
      per_page: 100,
    });

    const match = existing.find(
      (issue) => issue.title === TALLY_ISSUE_TITLE && !issue.pull_request,
    );
    if (match) {
      return match.number;
    }

    await this.ensureLabelExists();

    const created = await this.octokit.issues.create({
      ...this.ref,
      title: TALLY_ISSUE_TITLE,
      labels: [TALLY_ISSUE_LABEL],
      body: [
        'This issue tracks daily tally results posted by the automated tally bot.',
        '',
        'A new comment is added each cycle (UTC 00:00) summarizing open PRs, vote counts, and the candidate winner.',
        '',
        'The project curator (@bluevisor) retains veto power per `README.md`. This bot does not auto-merge.',
      ].join('\n'),
    });

    return created.data.number;
  }

  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      ...this.ref,
      issue_number: issueNumber,
      body,
    });
  }

  private async ensureLabelExists(): Promise<void> {
    try {
      await this.octokit.issues.getLabel({ ...this.ref, name: TALLY_ISSUE_LABEL });
    } catch (err) {
      if (isNotFound(err)) {
        await this.octokit.issues.createLabel({
          ...this.ref,
          name: TALLY_ISSUE_LABEL,
          color: 'fbca04',
          description: 'Tracks daily tally bot output',
        });
        return;
      }
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 404
  );
}

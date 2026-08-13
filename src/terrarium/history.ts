// Reads the repository's own git history: each commit becomes a founder
// creature. The unit separator (0x1f) keeps subjects with unusual
// punctuation parseable.

import { execFileSync } from 'node:child_process';

export interface CommitInfo {
  sha: string;
  author: string;
  subject: string;
}

const FIELD_SEP = '\x1f';

export function readCommitHistory(cwd: string = process.cwd()): CommitInfo[] {
  const output = execFileSync(
    'git',
    ['log', '--reverse', `--format=%H${FIELD_SEP}%an${FIELD_SEP}%s`],
    { cwd, encoding: 'utf8' },
  );
  return parseCommitLog(output);
}

export function parseCommitLog(output: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [sha, author, subject] = line.split(FIELD_SEP);
    if (!sha || !author) continue;
    commits.push({ sha, author, subject: subject ?? '' });
  }
  return commits;
}

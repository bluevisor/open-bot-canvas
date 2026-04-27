import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildEntries, countVotes, renderMarkdown, selectWinner, tally } from '../src/tally.ts';
import type { PullRequestInfo, ReactionRecord } from '../src/types.ts';

const FIXED_DATE = new Date('2026-04-25T00:00:00.000Z');

function pr(overrides: Partial<PullRequestInfo> & { number: number }): PullRequestInfo {
  return {
    title: `PR ${overrides.number}`,
    author: 'octocat',
    url: `https://github.com/x/y/pull/${overrides.number}`,
    draft: false,
    labels: [],
    mergeable: true,
    mergeableState: 'clean',
    ...overrides,
  };
}

describe('countVotes', () => {
  it('counts only +1 reactions', () => {
    const reactions: ReactionRecord[] = [
      { user: 'a', content: '+1' },
      { user: 'b', content: 'heart' },
      { user: 'c', content: '+1' },
    ];
    const result = countVotes(reactions);
    assert.equal(result.votes, 2);
    assert.deepEqual(result.voters, ['a', 'c']);
  });

  it('deduplicates votes from the same user', () => {
    const reactions: ReactionRecord[] = [
      { user: 'a', content: '+1' },
      { user: 'a', content: '+1' },
    ];
    const result = countVotes(reactions);
    assert.equal(result.votes, 1);
  });

  it('returns zero for empty input', () => {
    const result = countVotes([]);
    assert.equal(result.votes, 0);
    assert.deepEqual(result.voters, []);
  });
});

describe('buildEntries', () => {
  it('sorts by vote count desc, then PR number asc', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 }), pr({ number: 3 })];
    const reactions = new Map<number, ReactionRecord[]>([
      [1, [{ user: 'a', content: '+1' }]],
      [
        2,
        [
          { user: 'a', content: '+1' },
          { user: 'b', content: '+1' },
        ],
      ],
      [3, [{ user: 'a', content: '+1' }]],
    ]);
    const entries = buildEntries(prs, reactions);
    assert.equal(entries[0]?.pr.number, 2);
    assert.equal(entries[1]?.pr.number, 1);
    assert.equal(entries[2]?.pr.number, 3);
  });

  it('handles PRs missing from the reactions map', () => {
    const prs = [pr({ number: 1 })];
    const entries = buildEntries(prs, new Map());
    assert.equal(entries[0]?.votes, 0);
  });
});

describe('selectWinner', () => {
  it('picks the unique top entry', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 })];
    const reactions = new Map<number, ReactionRecord[]>([
      [1, [{ user: 'a', content: '+1' }]],
      [2, []],
    ]);
    const entries = buildEntries(prs, reactions);
    const { winner, tied } = selectWinner(entries);
    assert.equal(winner?.pr.number, 1);
    assert.equal(tied.length, 0);
  });

  it('returns no winner on a tie', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 })];
    const reactions = new Map<number, ReactionRecord[]>([
      [1, [{ user: 'a', content: '+1' }]],
      [2, [{ user: 'b', content: '+1' }]],
    ]);
    const entries = buildEntries(prs, reactions);
    const { winner, tied } = selectWinner(entries);
    assert.equal(winner, null);
    assert.equal(tied.length, 2);
  });

  it('excludes draft PRs from candidacy', () => {
    const prs = [pr({ number: 1, draft: true }), pr({ number: 2 })];
    const reactions = new Map<number, ReactionRecord[]>([
      [
        1,
        [
          { user: 'a', content: '+1' },
          { user: 'b', content: '+1' },
        ],
      ],
      [2, [{ user: 'c', content: '+1' }]],
    ]);
    const entries = buildEntries(prs, reactions);
    const { winner } = selectWinner(entries);
    assert.equal(winner?.pr.number, 2);
  });

  it('returns no winner when all PRs have zero votes', () => {
    const prs = [pr({ number: 1 })];
    const entries = buildEntries(prs, new Map([[1, []]]));
    const { winner, tied } = selectWinner(entries);
    assert.equal(winner, null);
    assert.equal(tied.length, 0);
  });
});

describe('renderMarkdown', () => {
  it('renders an empty-cycle message when no PRs are open', () => {
    const result = tally([], new Map(), FIXED_DATE);
    const md = renderMarkdown(result);
    assert.match(md, /Daily Tally — 2026-04-25/);
    assert.match(md, /No open pull requests/);
  });

  it('renders a winner section', () => {
    const prs = [pr({ number: 7, title: 'add foo' })];
    const reactions = new Map<number, ReactionRecord[]>([[7, [{ user: 'a', content: '+1' }]]]);
    const result = tally(prs, reactions, FIXED_DATE);
    const md = renderMarkdown(result);
    assert.match(md, /Candidate winner/);
    assert.match(md, /#7/);
    assert.match(md, /@bluevisor/);
  });

  it('renders a tie section', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 })];
    const reactions = new Map<number, ReactionRecord[]>([
      [1, [{ user: 'a', content: '+1' }]],
      [2, [{ user: 'b', content: '+1' }]],
    ]);
    const result = tally(prs, reactions, FIXED_DATE);
    const md = renderMarkdown(result);
    assert.match(md, /Tie at 1 vote/);
  });

  it('escapes pipe characters in PR titles', () => {
    const prs = [pr({ number: 1, title: 'fix a | b regression' })];
    const reactions = new Map<number, ReactionRecord[]>([[1, [{ user: 'a', content: '+1' }]]]);
    const result = tally(prs, reactions, FIXED_DATE);
    const md = renderMarkdown(result);
    assert.match(md, /fix a \\\| b regression/);
  });
});

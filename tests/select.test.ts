import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decideOutcome, renderSelection } from '../src/select.ts';
import type { PullRequestInfo, ReactionRecord, SelectionResult } from '../src/types.ts';

const FIXED_DATE = new Date('2026-04-26T04:00:00.000Z');

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

function reactions(map: Record<number, string[]>): Map<number, ReactionRecord[]> {
  const out = new Map<number, ReactionRecord[]>();
  for (const [num, voters] of Object.entries(map)) {
    out.set(
      Number(num),
      voters.map((user) => ({ user, content: '+1' })),
    );
  }
  return out;
}

describe('decideOutcome', () => {
  it('returns none when no PRs have votes', () => {
    const prs = [pr({ number: 1 })];
    const outcome = decideOutcome(prs, reactions({ 1: [] }), new Map());
    assert.equal(outcome.kind, 'none');
  });

  it('returns none with a tie carryover message', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 })];
    const outcome = decideOutcome(prs, reactions({ 1: ['a'], 2: ['b'] }), new Map());
    assert.equal(outcome.kind, 'none');
    if (outcome.kind === 'none') {
      assert.match(outcome.reason, /Tie at 1 vote/);
      assert.match(outcome.reason, /#1, #2/);
    }
  });

  it('vetoes when the candidate carries the veto label', () => {
    const candidate = pr({ number: 5, labels: ['veto'] });
    const prs = [candidate];
    const outcome = decideOutcome(prs, reactions({ 5: ['a'] }), new Map([[5, candidate]]));
    assert.equal(outcome.kind, 'vetoed');
  });

  it('defers when the fresh fetch shows the PR is unmergeable', () => {
    const listed = pr({ number: 7 });
    const fresh = pr({ number: 7, mergeable: false, mergeableState: 'dirty' });
    const outcome = decideOutcome([listed], reactions({ 7: ['a'] }), new Map([[7, fresh]]));
    assert.equal(outcome.kind, 'deferred');
  });

  it('defers when the candidate became a draft after the tally', () => {
    const listed = pr({ number: 9 });
    const fresh = pr({ number: 9, draft: true });
    const outcome = decideOutcome([listed], reactions({ 9: ['a'] }), new Map([[9, fresh]]));
    assert.equal(outcome.kind, 'deferred');
  });

  it('defers when the merge is blocked by branch protection', () => {
    const listed = pr({ number: 11 });
    const fresh = pr({ number: 11, mergeableState: 'blocked' });
    const outcome = decideOutcome([listed], reactions({ 11: ['a'] }), new Map([[11, fresh]]));
    assert.equal(outcome.kind, 'deferred');
  });

  it('returns merged with empty sha when mergeable', () => {
    const listed = pr({ number: 3 });
    const outcome = decideOutcome([listed], reactions({ 3: ['a'] }), new Map([[3, listed]]));
    assert.equal(outcome.kind, 'merged');
    if (outcome.kind === 'merged') {
      assert.equal(outcome.pr.number, 3);
      assert.equal(outcome.sha, '');
    }
  });

  it('uses the listed PR when no fresh entry exists', () => {
    const listed = pr({ number: 4, labels: ['veto'] });
    const outcome = decideOutcome([listed], reactions({ 4: ['a'] }), new Map());
    assert.equal(outcome.kind, 'vetoed');
  });
});

describe('renderSelection', () => {
  it('renders a merged outcome with the short sha', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'merged', pr: pr({ number: 1, title: 'add foo' }), sha: 'abcdef0123456789' },
    };
    const md = renderSelection(result);
    assert.match(md, /Cycle Selection — 2026-04-26/);
    assert.match(md, /Merged.*#1/);
    assert.match(md, /abcdef012345/);
  });

  it('renders a vetoed outcome', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: {
        kind: 'vetoed',
        pr: pr({ number: 2, labels: ['veto'] }),
        reason: 'PR carries the `veto` label.',
      },
    };
    const md = renderSelection(result);
    assert.match(md, /Vetoed.*#2/);
    assert.match(md, /veto/);
  });

  it('renders a deferred outcome with the reason', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'deferred', pr: pr({ number: 3 }), reason: 'Merge is blocked.' },
    };
    const md = renderSelection(result);
    assert.match(md, /Deferred.*#3/);
    assert.match(md, /Merge is blocked/);
  });

  it('renders a no-selection outcome', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'none', reason: 'No non-draft PR received a 👍 reaction.' },
    };
    const md = renderSelection(result);
    assert.match(md, /No selection/);
  });

  it('escapes pipes in PR titles', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'merged', pr: pr({ number: 1, title: 'fix a | b' }), sha: 'deadbeef0000' },
    };
    const md = renderSelection(result);
    assert.match(md, /fix a \\\| b/);
  });
});

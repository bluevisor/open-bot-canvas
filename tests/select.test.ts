import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decideOutcome, renderSelection } from '../src/select.ts';
import type { PullRequestInfo, SelectionResult } from '../src/types.ts';

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

describe('decideOutcome', () => {
  it('returns none when no candidate is supplied', () => {
    const outcome = decideOutcome(null);
    assert.equal(outcome.kind, 'none');
  });

  it('vetoes when the candidate carries the veto label', () => {
    const outcome = decideOutcome(pr({ number: 5, labels: ['cycle-candidate', 'veto'] }));
    assert.equal(outcome.kind, 'vetoed');
  });

  it('defers when the candidate became a draft after the tally', () => {
    const outcome = decideOutcome(pr({ number: 9, labels: ['cycle-candidate'], draft: true }));
    assert.equal(outcome.kind, 'deferred');
  });

  it('defers when the candidate has merge conflicts', () => {
    const outcome = decideOutcome(
      pr({ number: 7, labels: ['cycle-candidate'], mergeable: false, mergeableState: 'dirty' }),
    );
    assert.equal(outcome.kind, 'deferred');
  });

  it('returns ready when the candidate is mergeable and not vetoed', () => {
    const outcome = decideOutcome(pr({ number: 3, labels: ['cycle-candidate'] }));
    assert.equal(outcome.kind, 'ready');
    if (outcome.kind === 'ready') {
      assert.equal(outcome.pr.number, 3);
    }
  });

  it('returns ready even when mergeable_state is blocked (curator merges manually)', () => {
    const outcome = decideOutcome(
      pr({ number: 4, labels: ['cycle-candidate'], mergeableState: 'blocked' }),
    );
    assert.equal(outcome.kind, 'ready');
  });

  it('prefers veto over draft/dirty signals', () => {
    const outcome = decideOutcome(
      pr({ number: 6, labels: ['cycle-candidate', 'veto'], draft: true, mergeable: false }),
    );
    assert.equal(outcome.kind, 'vetoed');
  });
});

describe('renderSelection', () => {
  it('renders a ready outcome', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'ready', pr: pr({ number: 1, title: 'add foo' }) },
    };
    const md = renderSelection(result);
    assert.match(md, /Cycle Selection — 2026-04-26/);
    assert.match(md, /Ready for merge.*#1/);
    assert.match(md, /curator may merge/);
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
      outcome: { kind: 'deferred', pr: pr({ number: 3 }), reason: 'Merge conflicts.' },
    };
    const md = renderSelection(result);
    assert.match(md, /Deferred.*#3/);
    assert.match(md, /Merge conflicts/);
  });

  it('renders a no-selection outcome', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'none', reason: 'No PR carries the `cycle-candidate` label.' },
    };
    const md = renderSelection(result);
    assert.match(md, /No selection/);
  });

  it('escapes pipes in PR titles', () => {
    const result: SelectionResult = {
      cycleDate: '2026-04-26',
      generatedAt: FIXED_DATE.toISOString(),
      outcome: { kind: 'ready', pr: pr({ number: 1, title: 'fix a | b' }) },
    };
    const md = renderSelection(result);
    assert.match(md, /fix a \\\| b/);
  });
});

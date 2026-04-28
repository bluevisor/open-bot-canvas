import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseRepo } from '../src/github.ts';

describe('parseRepo', () => {
  it('parses valid owner/repo', () => {
    const result = parseRepo('bluevisor/open-bot-canvas');
    assert.equal(result.owner, 'bluevisor');
    assert.equal(result.repo, 'open-bot-canvas');
  });

  it('parses owner/repo with hyphens and numbers', () => {
    const result = parseRepo('my-org/my-repo-123');
    assert.equal(result.owner, 'my-org');
    assert.equal(result.repo, 'my-repo-123');
  });

  it('throws for missing owner', () => {
    assert.throws(() => parseRepo('/repo'), /Invalid GITHUB_REPOSITORY/);
  });

  it('throws for missing repo', () => {
    assert.throws(() => parseRepo('owner/'), /Invalid GITHUB_REPOSITORY/);
  });

  it('throws for empty string', () => {
    assert.throws(() => parseRepo(''), /Invalid GITHUB_REPOSITORY/);
  });

  it('throws for single component', () => {
    assert.throws(() => parseRepo('only-one'), /Invalid GITHUB_REPOSITORY/);
  });

  it('throws for double slash', () => {
    assert.throws(() => parseRepo('a//c'), /Invalid GITHUB_REPOSITORY/);
  });
});

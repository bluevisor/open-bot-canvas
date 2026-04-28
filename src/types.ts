export interface PullRequestInfo {
  number: number;
  title: string;
  author: string;
  url: string;
  draft: boolean;
  labels: string[];
  mergeable: boolean | null;
  mergeableState: string;
}

export interface ReactionRecord {
  user: string;
  content: string;
}

export interface TallyEntry {
  pr: PullRequestInfo;
  votes: number;
  voters: string[];
}

export interface TallyResult {
  generatedAt: string;
  cycleDate: string;
  entries: TallyEntry[];
  winner: TallyEntry | null;
  tied: TallyEntry[];
}

export type SelectionOutcome =
  | { kind: 'ready'; pr: PullRequestInfo }
  | { kind: 'vetoed'; pr: PullRequestInfo; reason: string }
  | { kind: 'deferred'; pr: PullRequestInfo; reason: string }
  | { kind: 'none'; reason: string };

export interface SelectionResult {
  cycleDate: string;
  generatedAt: string;
  outcome: SelectionOutcome;
}

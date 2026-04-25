export interface PullRequestInfo {
  number: number;
  title: string;
  author: string;
  url: string;
  draft: boolean;
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

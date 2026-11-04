/** Host-only scoring contracts; no transcript is sent to application scheduling. */
export interface WordScore {
  referenceWords: number;
  hypothesisWords: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  errors: number;
  wer: number | null;
  normalizedExactMatch: boolean;
  verbatimExactMatch: boolean;
}
export interface SttCorpus {
  version: 1;
  classification: 'PUBLIC_SYNTHETIC_ENGLISH_TEXT';
  samples: Array<{id: string; reference: string}>;
}
export interface SttBatch {
  version: 1;
  corpusSha256: string;
  artifactSha256: string;
  provenance: 'DIRECT_SYNTHETIC_PCM' | 'CONSENTED_MICROPHONE' | 'SCORER_SELF_TEST';
  engine: {name: 'Whisper.cpp' | 'AndroidOnDevice'; version: string; model: string; modelSha256: string | null};
  repetitionsPerCondition: number;
  samples: Array<{caseId: string; condition: 'cold' | 'warm'; iteration: number;
    outcome: 'RESULT' | 'EMPTY' | 'ERROR'; hypothesis: string; elapsedMs: number}>;
}
export interface TimingSummary {n: number; p50Ms: number | null; p95Ms: number | null; maxMs: number | null;}
export interface SttReport {
  version: 1;
  classification: string;
  recordedAtUtc: string;
  corpusSha256: string;
  artifactSha256: string;
  sourceSha256: string;
  engine: SttBatch['engine'];
  provenance: SttBatch['provenance'];
  metrics: {samples: number; result: number; empty: number; error: number;
    referenceWords: number; errors: number; werIncludingFailures: number | null;
    normalizedExactMatches: number; verbatimExactMatches: number;
    cold: TimingSummary; warm: TimingSummary};
  cases: Array<{caseId: string; condition: string; iteration: number; outcome: string;
    hypothesisSha256: string; score: WordScore}>;
  limits: string[];
}
export interface SttEvaluationTools {
  scoreWords: (reference: string, hypothesis: string) => WordScore;
  summarizeTimings: (values: number[]) => TimingSummary;
  createReport: (input: unknown, corpus: SttCorpus, corpusSha256: string) => SttReport;
  writeNewReport: (report: SttReport, output: string, root?: string) => void;
}

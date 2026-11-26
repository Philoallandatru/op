import type { EvaluationRound } from './agent-evaluation-report';

export function median(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length
    ? (ordered[middle] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2
    : null;
}

export function pairTimings(baseline: EvaluationRound, candidate: EvaluationRound) {
  const previous = new Map(baseline.results.map((result) => [result.caseId, result]));
  const pairs = [];
  let common = 0;
  for (const after of candidate.results) {
    const before = previous.get(after.caseId);
    if (!before) continue;
    common++;
    if (
      before.status !== 'completed' ||
      after.status !== 'completed' ||
      before.seconds === null ||
      after.seconds === null
    )
      continue;
    pairs.push({
      caseId: after.caseId,
      before: before.phaseSeconds,
      after: after.phaseSeconds,
      beforeSeconds: before.seconds,
      afterSeconds: after.seconds,
      delta: after.seconds - before.seconds,
    });
  }
  return { common, pairs };
}

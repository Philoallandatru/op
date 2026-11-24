import { expect, test } from 'vitest';
import type { EvaluationCase, EvaluationReport, EvaluationRound } from './agent-evaluation-report';
import { blindRoundJsonl } from './evaluation-blind-round';

const initial: EvaluationCase = {
  id: 'case-a',
  family: 'scheduling',
  split: 'challenge',
  question: 'Can the job resume?',
  observations: ['The worker is idle.'],
  referenceAnswer: 'A private reference answer.',
  criteria: [{ id: 'c1', text: 'Private grading rule.', weight: 1, critical: true, evidence: [] }],
  reject: [],
  evidence: [],
};
const followup: EvaluationCase = {
  ...initial,
  id: 'case-a-followup',
  blindFollowup: { caseId: 'case-a', form: 2, question: 'Now the job is queued. What changes?' },
};
const round: EvaluationRound = {
  id: 'candidate',
  label: 'Candidate',
  config: 'Private configuration details.',
  results: [followup, initial].map((item) => ({
    caseId: item.id,
    answer: null,
    review: null,
    status: 'pending',
    seconds: null,
    toolCalls: null,
  })),
};
const report: EvaluationReport = {
  schemaVersion: 1,
  title: 'Scheduling',
  blindContext: { spec: 'Manual 1', protocol: 'scheduler', observationHeading: 'Observed' },
  cases: [initial, followup, { ...initial, id: 'another-case' }],
  rounds: [round],
};

test('exports only the planned blind inputs in order, including the original follow-up form', () => {
  const rows = blindRoundJsonl(report, round)
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows).toEqual([
    {
      id: 'case-a',
      form: 2,
      spec: 'Manual 1',
      protocol: 'scheduler',
      question: followup.blindFollowup?.question,
    },
    {
      id: 'case-a',
      spec: 'Manual 1',
      protocol: 'scheduler',
      question: 'Can the job resume?\n\nObserved\n- The worker is idle.',
    },
  ]);
});

test('reports without a shared specification still export a usable blind question', () => {
  const rows = blindRoundJsonl({ ...report, blindContext: undefined }, round)
    .trimEnd()
    .split('\n');
  expect(JSON.parse(rows[1])).toEqual({
    id: 'case-a',
    question: 'Can the job resume?\n\n- The worker is idle.',
  });
});

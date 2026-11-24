import { describe, expect, it } from 'vitest';
import { EVALUATION_REPORT_MAX_BYTES, parseEvaluationReport } from './agent-evaluation-report.ts';

function example() {
  const item = {
    id: 'case-1',
    family: 'publication',
    split: 'development',
    question: 'Is this draft ready to publish?',
    observations: ['An editor has approved the draft.'],
    referenceAnswer: 'Publish after the owner approves it.',
    criteria: [
      { id: 'approval', text: 'Check owner approval', weight: 1, critical: true, evidence: ['e1'] },
    ],
    reject: ['Publish immediately'],
    evidence: [
      {
        id: 'e1',
        source: 'Editorial guide',
        page: 1,
        section: 'Approvals',
        anchor: 'owner approval',
      },
    ],
  };
  const result = {
    caseId: item.id,
    status: 'completed',
    answer: 'Ask the owner to approve.',
    seconds: 3.5,
    toolCalls: 1,
    review: {
      usability: 'ready',
      reason: 'Owner approval requested.',
      otherError: '',
      credits: { approval: 1 },
      rejectHits: [],
      score: 100,
      passed: true,
    },
  };
  return {
    schemaVersion: 1,
    title: 'Editorial review',
    cases: [item],
    rounds: [{ id: 'r1', label: 'Baseline', config: 'Local', results: [result] }],
  };
}

describe('parseEvaluationReport', () => {
  it('reads the first-round grid and preserves the difference between ungraded and unplanned', () => {
    const data = example();
    const second = { ...data.cases[0], id: 'case-2' };
    const report = {
      ...data,
      blindContext: {
        spec: 'Review manual',
        protocol: 'documents',
        observationHeading: 'Observed',
      },
      cases: [
        ...data.cases,
        {
          ...second,
          blindFollowup: { caseId: 'case-1', form: 2, question: 'The owner declined. What now?' },
        },
      ],
      rounds: [
        ...data.rounds,
        {
          ...data.rounds[0],
          id: 'r2',
          results: [
            {
              ...data.rounds[0].results[0],
              review: null,
              tokens: 128,
              readPages: [{ source: 'Review manual', page: 2 }],
            },
            {
              caseId: second.id,
              status: 'pending',
              answer: null,
              seconds: null,
              toolCalls: null,
              review: null,
            },
          ],
        },
      ],
    };
    expect(parseEvaluationReport(`\uFEFF${JSON.stringify(report)}`)).toEqual(report);
    expect(parseEvaluationReport(JSON.stringify(data)).blindContext).toBeUndefined();
  });

  it('rejects dangling, duplicate, and prototype-related identifiers', () => {
    const data = example();
    const item = data.cases[0];
    for (const broken of [
      { ...data, rounds: [...data.rounds, ...data.rounds] },
      { ...data, cases: [item, item] },
      { ...data, cases: [{ ...item, id: 'constructor' }] },
      { ...data, cases: [{ ...item, evidence: [] }] },
      { ...data, cases: [{ ...item, id: 'other-case' }] },
    ])
      expect(() => parseEvaluationReport(JSON.stringify(broken))).toThrow();
  });

  it('validates grades against the rubric and actual answer', () => {
    const data = example();
    const round = data.rounds[0];
    const row = round.results[0];
    for (const invalid of [
      { ...row, answer: null },
      { ...row, status: 'pending' },
      { ...row, review: { ...row.review, passed: false } },
      { ...row, review: { ...row.review, score: 80 } },
      { ...row, review: { ...row.review, credits: {} } },
      { ...row, review: { ...row.review, rejectHits: [2] } },
      { ...row, review: { ...row.review, usability: 'no_answer' } },
    ]) {
      expect(() =>
        parseEvaluationReport(
          JSON.stringify({ ...data, rounds: [{ ...round, results: [invalid] }] }),
        ),
      ).toThrow();
    }
  });

  it('rejects earned credit on unanswered attempts and telemetry on pending attempts', () => {
    const data = example();
    const round = data.rounds[0];
    const row = {
      ...round.results[0],
      status: 'incomplete',
      answer: null,
      review: {
        ...round.results[0].review,
        usability: 'no_answer',
        score: 0,
        passed: false,
        credits: {},
      },
    };
    const parse = (result: object) =>
      parseEvaluationReport(JSON.stringify({ ...data, rounds: [{ ...round, results: [result] }] }));
    expect(parse(row).rounds[0]?.results[0]).toEqual(row);
    expect(() => parse({ ...row, review: { ...row.review, credits: { approval: 1 } } })).toThrow();
    expect(() => parse({ ...row, review: { ...row.review, rejectHits: [1] } })).toThrow();
    expect(() =>
      parse({
        ...row,
        status: 'pending',
        review: null,
        seconds: null,
        toolCalls: null,
        tokens: 1,
      }),
    ).toThrow();
  });

  it('rejects distinct cases with the same blind identity even across separate runs', () => {
    const data = example();
    const item = data.cases[0];
    const round = data.rounds[0];
    const blindFollowup = { caseId: 'original', form: 1, question: 'What changes?' };
    const a = { ...item, blindFollowup };
    const b = { ...a, id: 'second' };
    const result = round.results[0];
    expect(() =>
      parseEvaluationReport(
        JSON.stringify({
          ...data,
          cases: [a, b],
          rounds: [round, { ...round, id: 'r2', results: [{ ...result, caseId: b.id }] }],
        }),
      ),
    ).toThrow('Duplicate blind question.');
  });

  it('rejects malformed JSON, unknown versions, and multibyte input beyond the byte cap', () => {
    expect(() => parseEvaluationReport('{')).toThrow();
    expect(() =>
      parseEvaluationReport(JSON.stringify({ ...example(), schemaVersion: 2 })),
    ).toThrow();
    expect(() =>
      parseEvaluationReport('汉'.repeat(Math.ceil(EVALUATION_REPORT_MAX_BYTES / 3))),
    ).toThrow(/size/);
  });
});

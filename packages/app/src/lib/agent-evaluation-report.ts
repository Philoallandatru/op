import { z } from 'zod';

export const EVALUATION_REPORT_MAX_BYTES = 8 * 1024 * 1024;

const id = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/)
  .refine((key) => !Object.hasOwn(Object.prototype, key) && key !== 'prototype');
const label = z.string().trim().min(1).max(512);
const prose = z.string().min(1).max(256_000);
const credit = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const evidence = z.object({
  id,
  source: label,
  page: z.number().int().positive(),
  section: label,
  anchor: prose,
});
const criterion = z.object({
  id,
  text: prose,
  weight: z.number().int().min(1).max(10_000),
  critical: z.boolean(),
  evidence: z.array(id).max(256),
});
const scenario = z.object({
  id,
  family: label,
  split: label,
  blindFollowup: z
    .object({ caseId: id, form: z.number().int().positive(), question: prose })
    .optional(),
  question: prose,
  observations: z.array(prose).max(256),
  referenceAnswer: prose,
  criteria: z.array(criterion).min(1).max(256),
  reject: z.array(prose).max(256),
  evidence: z.array(evidence).max(256),
});
const review = z.object({
  usability: z.enum(['ready', 'revise', 'misleading', 'no_answer']).nullable(),
  reason: prose,
  otherError: z.string().max(256_000),
  credits: z.record(id, credit),
  rejectHits: z.array(z.number().int().positive()).max(256),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
});
const result = z.object({
  caseId: id,
  status: z.enum(['completed', 'incomplete', 'pending']),
  answer: prose.nullable(),
  seconds: z.number().nonnegative().nullable(),
  toolCalls: z.number().int().nonnegative().nullable(),
  tokens: z.number().int().nonnegative().optional(),
  readPages: z
    .array(z.object({ source: label, page: z.number().int().positive() }))
    .max(10_000)
    .optional(),
  review: review.nullable(),
});
const round = z.object({
  id,
  label,
  config: prose,
  results: z.array(result).min(1).max(10_000),
});
const report = z.object({
  schemaVersion: z.literal(1),
  title: label,
  blindContext: z
    .object({ spec: label, protocol: label, observationHeading: label.optional() })
    .optional(),
  cases: z.array(scenario).min(1).max(10_000),
  rounds: z.array(round).min(1).max(100),
});

export type EvaluationCase = z.infer<typeof scenario>;
export type EvaluationReport = z.infer<typeof report>;
export type EvaluationResult = z.infer<typeof result>;
export type EvaluationRound = z.infer<typeof round>;

function unique<T>(values: T[]) {
  return new Set(values).size === values.length;
}

function validResult(row: EvaluationResult, item: EvaluationCase) {
  const completed = row.status === 'completed';
  if (completed ? !row.answer?.trim() : row.answer !== null) return false;
  if (row.status === 'pending') {
    return (
      row.review === null &&
      row.seconds === null &&
      row.toolCalls === null &&
      row.tokens === undefined &&
      !row.readPages?.length
    );
  }
  const grade = row.review;
  if (!grade) return true;
  if (completed ? grade.usability === 'no_answer' : grade.usability !== 'no_answer') return false;
  if (!completed && (grade.rejectHits.length || Object.values(grade.credits).some(Boolean)))
    return false;
  const ids = new Set(item.criteria.map((c) => c.id));
  const keys = Object.keys(grade.credits);
  if (keys.some((key) => !ids.has(key)) || (completed && keys.length !== ids.size)) return false;
  if (!unique(grade.rejectHits) || grade.rejectHits.some((index) => index > item.reject.length))
    return false;
  const total = item.criteria.reduce((n, c) => n + c.weight, 0);
  const earned = completed
    ? item.criteria.reduce((n, c) => n + c.weight * grade.credits[c.id], 0)
    : 0;
  const passed =
    completed &&
    earned * 100 >= total * 80 &&
    !grade.rejectHits.length &&
    item.criteria.every((c) => !c.critical || grade.credits[c.id] === 1);
  return passed === grade.passed && Math.abs(grade.score - (earned * 100) / total) <= 0.005001;
}

export function parseEvaluationReport(text: string): EvaluationReport {
  if (
    text.length > EVALUATION_REPORT_MAX_BYTES ||
    new TextEncoder().encode(text).length > EVALUATION_REPORT_MAX_BYTES
  ) {
    throw new Error('Report exceeds the import size limit.');
  }
  const parsed = report.safeParse(JSON.parse(text.replace(/^\uFEFF/, '')));
  if (!parsed.success) throw new Error('Invalid evaluation report format.');
  const data = parsed.data;
  const cases = new Map(data.cases.map((item) => [item.id, item]));
  if (cases.size !== data.cases.length || !unique(data.rounds.map((item) => item.id))) {
    throw new Error('Duplicate case or round ID.');
  }
  const blindIdentities = new Set<string>();
  for (const item of data.cases) {
    const followup = item.blindFollowup;
    const identity = followup ? `${followup.caseId}:${followup.form}` : `${item.id}:0`;
    if (blindIdentities.has(identity)) throw new Error('Duplicate blind question.');
    blindIdentities.add(identity);
    const sources = new Set(item.evidence.map((entry) => entry.id));
    if (
      sources.size !== item.evidence.length ||
      !unique(item.criteria.map((c) => c.id)) ||
      item.criteria.some((c) => c.evidence.some((e) => !sources.has(e)))
    ) {
      throw new Error('Invalid case rubric or evidence references.');
    }
  }
  for (const iteration of data.rounds) {
    if (!unique(iteration.results.map((entry) => entry.caseId)))
      throw new Error('Duplicate result within a round.');
    for (const row of iteration.results) {
      const item = cases.get(row.caseId);
      if (!item || !validResult(row, item)) throw new Error('Inconsistent evaluation result.');
    }
  }
  return data;
}

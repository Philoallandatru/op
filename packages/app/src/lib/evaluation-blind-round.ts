import type { EvaluationCase, EvaluationReport, EvaluationRound } from './agent-evaluation-report';

export function blindQuestionText(
  item: EvaluationCase,
  context: EvaluationReport['blindContext'],
): string {
  if (item.blindFollowup) return item.blindFollowup.question;
  if (!item.observations.length) return item.question;
  const heading = context?.observationHeading ? `${context.observationHeading}\n` : '';
  const observations = item.observations.map((value) => `- ${value}`).join('\n');
  return `${item.question}\n\n${heading}${observations}`;
}

export function blindRoundJsonl(report: EvaluationReport, round: EvaluationRound): string {
  const cases = new Map(report.cases.map((item) => [item.id, item]));
  const rows = round.results.map(({ caseId }) => {
    const item = cases.get(caseId);
    if (!item) throw new Error('Unknown evaluation case.');
    const followup = item.blindFollowup;
    const context = report.blindContext;
    return JSON.stringify({
      id: followup?.caseId ?? item.id,
      ...(followup ? { form: followup.form } : {}),
      ...(context ? { spec: context.spec, protocol: context.protocol } : {}),
      question: blindQuestionText(item, context),
    });
  });
  return `${rows.join('\n')}\n`;
}

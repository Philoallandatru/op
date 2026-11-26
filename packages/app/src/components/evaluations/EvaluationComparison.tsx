import { Trans, useLingui } from '@lingui/react/macro';
import { useId, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  EvaluationReport,
  EvaluationResult,
  EvaluationRound,
} from '@/lib/agent-evaluation-report';
import { median } from '@/lib/evaluation-timing';
import { EvaluationCaseDetail } from './EvaluationCaseDetail';
import { EvaluationRetestExport } from './EvaluationRetestExport';
import { EvaluationIterationHistory, EvaluationRunAnalysis } from './EvaluationRunAnalysis';

function usable(result: EvaluationResult): boolean | null {
  if (result.status === 'incomplete') return false;
  return result.review?.usability ? result.review.usability === 'ready' : null;
}

function summarize(round: EvaluationRound) {
  const rows = round.results;
  return {
    planned: rows.length,
    completed: rows.filter((r) => r.status === 'completed').length,
    passed: rows.filter((r) => r.review?.passed).length,
    unscored: rows.filter((r) => r.status === 'pending' || (r.status === 'completed' && !r.review))
      .length,
    ready: rows.filter((r) => usable(r) === true).length,
    misleading: rows.filter((r) => r.review?.usability === 'misleading').length,
    ungraded: rows.filter((r) => usable(r) === null).length,
    ungradedAnswers: rows.filter((r) => r.status === 'completed' && !r.review?.usability).length,
  };
}

function fraction(count: number, total: number, locale: string) {
  return total
    ? new Intl.NumberFormat(locale || undefined, {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(count / total)
    : '—';
}

function MetricCell({
  count,
  total,
  final,
  locale,
}: {
  count: number;
  total: number;
  final: boolean;
  locale: string;
}) {
  return (
    <td>
      <strong>{final ? fraction(count, total, locale) : '—'}</strong>
      <small>
        {count} / {total}
      </small>
    </td>
  );
}

function RoundLatency({
  round,
  metric,
  locale,
}: {
  round: EvaluationRound;
  metric: NonNullable<EvaluationReport['latencyMetric']>;
  locale: string;
}) {
  const completed = round.results.filter((row) => row.status === 'completed');
  const measured = completed.flatMap((row) => (row.seconds === null ? [] : [row.seconds]));
  const phases = completed.flatMap((row) => (row.phaseSeconds ? [row.phaseSeconds] : []));
  const formatter = new Intl.NumberFormat(locale || undefined, {
    maximumFractionDigits: 3,
    style: 'unit',
    unit: 'second',
  });
  const duration = (values: number[]) => {
    const value = median(values);
    return value === null ? '—' : formatter.format(value);
  };
  return (
    <td>
      <strong>{duration(measured)}</strong>
      {measured.length < completed.length ? (
        <small>
          {measured.length} / {completed.length}
        </small>
      ) : null}
      {phases.length ? (
        <small>
          {Object.keys(metric.stages).map((stage) => {
            const key = stage as keyof typeof metric.stages;
            return (
              <span key={key} className="block whitespace-nowrap">
                {metric.stages[key]} {duration(phases.map((row) => row[key]))}
              </span>
            );
          })}
          {phases.length < measured.length ? (
            <span className="block">
              {phases.length} / {measured.length}
            </span>
          ) : null}
        </small>
      ) : null}
    </td>
  );
}

function RoundSummary({
  round,
  criterionMetrics,
  latencyMetric,
}: {
  round: EvaluationRound;
  criterionMetrics: (NonNullable<EvaluationReport['conditionMetric']> & { key: string })[];
  latencyMetric?: EvaluationReport['latencyMetric'];
}) {
  const { t, i18n } = useLingui();
  const totals = summarize(round);
  const metrics = [
    [t`Ready / planned`, totals.ready, totals.planned, totals.ungraded === 0],
    [t`Misleading / completed`, totals.misleading, totals.completed, totals.ungradedAnswers === 0],
    [t`Rubric pass / planned`, totals.passed, totals.planned, totals.unscored === 0],
    [t`Completed / planned`, totals.completed, totals.planned, true],
  ] as const;
  return (
    <tr>
      <th scope="row">
        <span>{round.label}</span>
        <details>
          <summary>
            <Trans>Configuration</Trans>
          </summary>
          <p className="evaluation-prose">{round.config}</p>
        </details>
      </th>
      {metrics.map(([label, count, total, final]) => (
        <MetricCell key={label} count={count} total={total} final={final} locale={i18n.locale} />
      ))}
      {criterionMetrics.map(({ criterionId, key }) => (
        <MetricCell
          key={key}
          count={round.results.filter((r) => r.review?.credits[criterionId] === 1).length}
          total={totals.planned}
          final={totals.unscored === 0}
          locale={i18n.locale}
        />
      ))}
      {latencyMetric ? (
        <RoundLatency round={round} metric={latencyMetric} locale={i18n.locale} />
      ) : null}
      <td>{totals.ungraded}</td>
    </tr>
  );
}

function PairedReadiness({
  baseline,
  candidate,
}: {
  baseline: EvaluationRound;
  candidate: EvaluationRound;
}) {
  const baselineResults = new Map(baseline.results.map((result) => [result.caseId, result]));
  let gained = 0;
  let lost = 0;
  let evaluated = 0;
  let common = 0;
  for (const result of candidate.results) {
    const previous = baselineResults.get(result.caseId);
    if (!previous) continue;
    common++;
    const before = usable(previous);
    const after = usable(result);
    if (before === null || after === null) continue;
    evaluated++;
    if (!before && after) gained++;
    if (before && !after) lost++;
  }
  return (
    <div className="evaluation-pairs">
      <span>
        <Trans>Paired verdicts</Trans>{' '}
        <b>
          {evaluated} / {common}
        </b>
      </span>
      <span>
        <i data-tone="gain" />
        <Trans>Became ready</Trans> <b>{gained}</b>
      </span>
      <span>
        <i data-tone="loss" />
        <Trans>No longer ready</Trans> <b>{lost}</b>
      </span>
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onSelect,
  count,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
  count?: number;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id}>
        {label} {count !== undefined && <span className="evaluation-count">{count}</span>}
      </label>
      <Select value={value} onValueChange={onSelect}>
        <SelectTrigger
          id={id}
          aria-label={label}
          className="mt-1 [&_[data-slot=select-value]]:truncate"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-w-[min(85vw,44rem)]">
          {options.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EvaluationComparison({ report }: { report: EvaluationReport }) {
  const { rounds, cases, conditionMetric, acceptanceMetric, latencyMetric } = report;
  const criterionMetrics = [
    ...(conditionMetric ? [{ key: 'conditions', ...conditionMetric }] : []),
    ...(acceptanceMetric ? [{ key: 'acceptance', ...acceptanceMetric }] : []),
  ];
  const [baselineId, setBaseline] = useState(rounds[0]?.id ?? '');
  const [candidateId, setCandidate] = useState(rounds.at(-1)?.id ?? '');
  const [caseId, setCase] = useState(cases[0]?.id ?? '');
  const baseline = rounds.find((r) => r.id === baselineId);
  const candidate = rounds.find((r) => r.id === candidateId);
  const selectedCase = cases.find((c) => c.id === caseId);
  const visible = [baseline, candidate].filter(
    (round, index, list): round is EvaluationRound => !!round && list.indexOf(round) === index,
  );
  const { t } = useLingui();

  function chooseRound(value: string, first: boolean) {
    if (first) {
      if (value === candidateId) setCandidate(baselineId);
      setBaseline(value);
    } else {
      if (value === baselineId) setBaseline(candidateId);
      setCandidate(value);
    }
  }

  return (
    <>
      <div className="evaluation-table-scroll">
        <table className="evaluation-summary">
          <caption className="sr-only">
            <Trans>Run metrics</Trans>
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <Trans>Run</Trans>
              </th>
              <th scope="col">
                <Trans>Ready / planned</Trans>
              </th>
              <th scope="col">
                <Trans>Misleading / completed</Trans>
              </th>
              <th scope="col">
                <Trans>Rubric pass / planned</Trans>
              </th>
              <th scope="col">
                <Trans>Completed / planned</Trans>
              </th>
              {criterionMetrics.map(({ key, label }) => (
                <th key={key} scope="col">
                  {label}
                </th>
              ))}
              {latencyMetric ? <th scope="col">{latencyMetric.label}</th> : null}
              <th scope="col">
                <Trans>Awaiting verdict</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <RoundSummary
                key={round.id}
                round={round}
                criterionMetrics={criterionMetrics}
                latencyMetric={latencyMetric}
              />
            ))}
          </tbody>
        </table>
      </div>
      {rounds.length > 1 && (
        <div className="evaluation-selectors">
          {[
            { name: t`Baseline`, value: baselineId, first: true },
            { name: t`Comparison run`, value: candidateId, first: false },
          ].map((item) => (
            <Picker
              key={item.name}
              label={item.name}
              options={rounds}
              value={item.value}
              onSelect={(id) => chooseRound(id, item.first)}
            />
          ))}
        </div>
      )}
      {baseline && candidate && baseline !== candidate && (
        <PairedReadiness baseline={baseline} candidate={candidate} />
      )}
      {baseline && candidate && baseline !== candidate && latencyMetric && (
        <EvaluationRunAnalysis
          baseline={baseline}
          candidate={candidate}
          stages={latencyMetric.stages}
          limit={report.pairedLatencyLimit}
          caseId={caseId}
          selectCase={setCase}
        />
      )}
      {!!report.iterationHistory?.length && (
        <EvaluationIterationHistory history={report.iterationHistory} />
      )}
      {candidate && <EvaluationRetestExport report={report} round={candidate} />}
      <div className="evaluation-case-selector">
        <Picker
          label={t`Question`}
          count={cases.length}
          value={caseId}
          options={cases.map((row) => ({ id: row.id, label: `${row.id} · ${row.question}` }))}
          onSelect={setCase}
        />
      </div>
      {selectedCase && (
        <EvaluationCaseDetail
          key={selectedCase.id}
          item={selectedCase}
          rounds={visible}
          blindContext={report.blindContext}
        />
      )}
    </>
  );
}

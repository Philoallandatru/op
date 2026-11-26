import { useLingui } from '@lingui/react/macro';
import { useId } from 'react';
import type { EvaluationReport, EvaluationRound } from '@/lib/agent-evaluation-report';
import { median, pairTimings } from '@/lib/evaluation-timing';

type TimingLabels = NonNullable<EvaluationReport['latencyMetric']>['stages'];

export function EvaluationRunAnalysis({
  baseline,
  candidate,
  stages,
  limit,
  caseId,
  selectCase,
}: {
  baseline: EvaluationRound;
  candidate: EvaluationRound;
  stages: TimingLabels;
  limit?: number;
  caseId: string;
  selectCase: (id: string) => void;
}) {
  const { t, i18n } = useLingui();
  const pairedTitle = useId();
  const stagesTitle = useId();
  const { common, pairs } = pairTimings(baseline, candidate);
  if (!pairs.length) return null;
  const seconds = new Intl.NumberFormat(i18n.locale || undefined, {
    maximumFractionDigits: 3,
    style: 'unit',
    unit: 'second',
  });
  const signed = new Intl.NumberFormat(i18n.locale || undefined, {
    maximumFractionDigits: 3,
    style: 'unit',
    unit: 'second',
    signDisplay: 'exceptZero',
  });
  const phased = pairs.flatMap(({ before, after }) => (before && after ? [{ before, after }] : []));
  const plotted = (Object.keys(stages) as (keyof TimingLabels)[]).flatMap((stage) => {
    const before = median(phased.map((pair) => pair.before[stage]));
    const after = median(phased.map((pair) => pair.after[stage]));
    return before === null || after === null || (!before && !after)
      ? []
      : [{ stage, before, after }];
  });
  const stageRange = Math.max(1, ...plotted.map(({ before, after }) => Math.max(before, after)));
  const sorted = pairs.toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const selected = pairs.find((pair) => pair.caseId === caseId);
  const stageDeltas =
    selected?.before && selected.after
      ? (Object.keys(stages) as (keyof TimingLabels)[]).flatMap((stage) => {
          const before = selected.before?.[stage];
          const after = selected.after?.[stage];
          return before === undefined || after === undefined || (!before && !after)
            ? []
            : [`${stages[stage]} ${signed.format(after - before)}`];
        })
      : [];
  const display =
    sorted.length > 20 && selected && !sorted.slice(0, 20).includes(selected)
      ? [...sorted.slice(0, 19), selected]
      : sorted.slice(0, 20);
  const range = Math.max(1, limit ?? 0, ...pairs.map(({ delta }) => Math.abs(delta)));
  const middle = median(pairs.map(({ delta }) => delta)) ?? 0;
  return (
    <div className="evaluation-analysis">
      <figure className="evaluation-plot" aria-labelledby={pairedTitle}>
        <figcaption id={pairedTitle}>
          {t({ id: 'evaluation.plot.paired', message: 'Paired latency' })}
        </figcaption>
        <div className="evaluation-plot-meta">
          <strong data-missed={limit !== undefined && middle > limit}>
            {signed.format(middle)}
          </strong>
          <span>
            {t({ id: 'evaluation.plot.median', message: 'Median change' })} · {pairs.length} /{' '}
            {common}
          </span>
          {limit !== undefined && (
            <span>
              {t({ id: 'evaluation.plot.limit', message: 'Limit' })} {signed.format(limit)}
            </span>
          )}
        </div>
        <div className="evaluation-plot-axis" aria-hidden="true">
          <span />
          <span>
            <span>{signed.format(-range)}</span>
            <span>0</span>
            <span>{signed.format(range)}</span>
          </span>
          <span />
        </div>
        <div className="evaluation-plot-list">
          {display.map(({ caseId: id, delta }) => (
            <button
              className="evaluation-plot-case"
              type="button"
              key={id}
              aria-pressed={id === caseId}
              onClick={() => selectCase(id)}
            >
              <span>{id}</span>
              <span className="evaluation-plot-track" aria-hidden="true" dir="ltr">
                {limit !== undefined && (
                  <i
                    className="evaluation-plot-limit"
                    style={{ insetInlineStart: `${50 + (limit / range) * 50}%` }}
                  />
                )}
                <i
                  className="evaluation-plot-delta"
                  data-slower={delta > 0}
                  style={{
                    left: `${50 + Math.min(0, (delta / range) * 50)}%`,
                    width: `${(Math.abs(delta) / range) * 50}%`,
                  }}
                />
              </span>
              <b>{signed.format(delta)}</b>
            </button>
          ))}
        </div>
        {display.length < pairs.length && (
          <p className="evaluation-plot-note">
            {t({ id: 'evaluation.plot.largest', message: 'Largest changes and selected question' })}{' '}
            · {display.length} / {pairs.length}
          </p>
        )}
        {selected && (
          <p className="evaluation-plot-note">
            {selected.caseId} · {seconds.format(selected.beforeSeconds)} →{' '}
            {seconds.format(selected.afterSeconds)}
          </p>
        )}
      </figure>
      {phased.length > 0 && (
        <figure className="evaluation-plot" aria-labelledby={stagesTitle}>
          <figcaption id={stagesTitle}>
            {t({ id: 'evaluation.plot.stages', message: 'Time by stage' })}
          </figcaption>
          <div className="evaluation-plot-meta">
            <span>
              <i className="evaluation-plot-key" />
              {t({ id: 'evaluation.plot.baseline', message: 'Baseline' })}
            </span>
            <span>
              <i className="evaluation-plot-key" data-candidate />
              {t({ id: 'evaluation.plot.candidate', message: 'Candidate' })}
            </span>
          </div>
          <dl className="evaluation-stage-list">
            {plotted.map(({ stage, before, after }) => (
              <div key={stage}>
                <dt>{stages[stage]}</dt>
                <dd>
                  <span className="evaluation-stage-bars" aria-hidden="true">
                    <i style={{ width: `${(before / stageRange) * 100}%` }} />
                    <i data-candidate style={{ width: `${(after / stageRange) * 100}%` }} />
                  </span>
                  <span>
                    {seconds.format(before)} → {seconds.format(after)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="evaluation-plot-note">
            {t({ id: 'evaluation.plot.stagePairs', message: 'Pairs with stage timing' })} ·{' '}
            {phased.length} / {pairs.length}
          </p>
          {selected && stageDeltas.length > 0 && (
            <p className="evaluation-plot-note">
              {selected.caseId} · {stageDeltas.join(' · ')}
            </p>
          )}
        </figure>
      )}
    </div>
  );
}

export function EvaluationIterationHistory({
  history,
}: {
  history: NonNullable<EvaluationReport['iterationHistory']>;
}) {
  const { t, i18n } = useLingui();
  const signed = new Intl.NumberFormat(i18n.locale || undefined, {
    style: 'unit',
    unit: 'second',
    maximumFractionDigits: 3,
    signDisplay: 'exceptZero',
  });
  return (
    <details className="evaluation-history">
      <summary>
        {t({ id: 'evaluation.history.title', message: 'Iteration history' })}{' '}
        <span>{history.length}</span>
      </summary>
      {history
        .toReversed()
        .map(
          (
            { id, title, method, progress, next, baseline, candidate, medianDelta, timedPairs },
            index,
          ) => (
            <details className="evaluation-history-entry" key={id} open={index === 0 || undefined}>
              <summary>{title}</summary>
              <div className="evaluation-history-metrics">
                <span>
                  {t({ id: 'evaluation.history.ready', message: 'Ready / planned' })}{' '}
                  <b>
                    {baseline.ready}/{baseline.planned} → {candidate.ready}/{candidate.planned}
                  </b>
                </span>
                <span>
                  {t({ id: 'evaluation.history.misleading', message: 'Misleading / completed' })}{' '}
                  <b>
                    {baseline.misleading}/{baseline.completed} → {candidate.misleading}/
                    {candidate.completed}
                  </b>
                </span>
                {medianDelta !== null && (
                  <span>
                    {t({ id: 'evaluation.plot.median', message: 'Median change' })}{' '}
                    <b>
                      {signed.format(medianDelta)} ({timedPairs})
                    </b>
                  </span>
                )}
              </div>
              <dl>
                <div>
                  <dt>{t({ id: 'evaluation.history.method', message: 'Method' })}</dt>
                  <dd>{method}</dd>
                </div>
                <div>
                  <dt>{t({ id: 'evaluation.history.progress', message: 'Progress' })}</dt>
                  <dd>{progress}</dd>
                </div>
                <div>
                  <dt>{t({ id: 'evaluation.history.next', message: 'Next step' })}</dt>
                  <dd>{next}</dd>
                </div>
              </dl>
            </details>
          ),
        )}
    </details>
  );
}

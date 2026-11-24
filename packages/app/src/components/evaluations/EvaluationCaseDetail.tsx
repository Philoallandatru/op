import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { BookOpen } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import type {
  EvaluationCase,
  EvaluationReport,
  EvaluationResult,
  EvaluationRound,
} from '@/lib/agent-evaluation-report';
import { blindQuestionText } from '@/lib/evaluation-blind-round';
import { EvaluationAgentRetest } from './EvaluationAgentRetest';
import { EvaluationAnswerMarkdown } from './EvaluationAnswerMarkdown';

function Answer({ round, item }: { round: EvaluationRound; item: EvaluationCase }) {
  const { t, i18n } = useLingui();
  const result = round.results.find((r) => r.caseId === item.id);
  const tokens = result?.tokens;
  const review = result?.review;
  const verdicts = {
    ready: t`Ready to use`,
    revise: t`Needs revision`,
    misleading: t`Misleading`,
    no_answer: t`No final answer`,
  };
  function status(row: EvaluationResult | undefined) {
    if (!row) return t`Not planned`;
    if (row.status === 'incomplete') return verdicts.no_answer;
    if (row.status === 'pending') return t`Pending run`;
    return row.review?.usability ? verdicts[row.review.usability] : t`Awaiting verdict`;
  }
  return (
    <article className="evaluation-answer">
      <header>
        <h4>{round.label}</h4>
        <span className="evaluation-verdict" data-verdict={review?.usability}>
          {status(result)}
        </span>
      </header>
      {result?.answer && <EvaluationAnswerMarkdown text={result.answer} />}
      {result && (
        <dl className="evaluation-cost">
          {result.seconds !== null && (
            <div>
              <dt>
                <Trans>Duration</Trans>
              </dt>
              <dd>
                {new Intl.NumberFormat(i18n.locale || undefined, {
                  style: 'unit',
                  unit: 'second',
                  maximumFractionDigits: 1,
                }).format(result.seconds)}
              </dd>
            </div>
          )}
          {result.toolCalls !== null && (
            <div>
              <dt>
                <Trans>Tool calls</Trans>
              </dt>
              <dd>{result.toolCalls}</dd>
            </div>
          )}
          {tokens !== undefined && (
            <div>
              <dt>
                <Plural value={tokens} one="token" other="tokens" />
              </dt>
              <dd>{new Intl.NumberFormat(i18n.locale || undefined).format(tokens)}</dd>
            </div>
          )}
        </dl>
      )}
      {result?.readPages && (
        <details className="evaluation-disclosure">
          <summary>
            <Trans>Pages opened</Trans> <span>{result.readPages.length}</span>
          </summary>
          <ul className="evaluation-list">
            {result.readPages.map((page) => (
              <li key={`${page.source}-${page.page}`}>
                {page.source} · <Trans>Page</Trans> {page.page}
              </li>
            ))}
          </ul>
        </details>
      )}
      {review && (
        <details className="evaluation-disclosure">
          <summary>
            <Trans>Review</Trans> <span>{review.score} / 100</span>
          </summary>
          <p className="evaluation-prose">{review.reason}</p>
          {review.otherError && (
            <p className="evaluation-prose evaluation-error">{review.otherError}</p>
          )}
          <ul className="evaluation-credits">
            {item.criteria.map((criterion) => (
              <li key={criterion.id}>
                <span className="evaluation-number">{review.credits[criterion.id] ?? '—'} / 1</span>
                <span>{criterion.text}</span>
              </li>
            ))}
          </ul>
          {review.rejectHits.map((i) => (
            <p key={i} className="evaluation-error">
              {item.reject[i - 1]}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}

export function EvaluationCaseDetail({
  item,
  blindContext,
  rounds,
}: {
  item: EvaluationCase;
  blindContext: EvaluationReport['blindContext'];
  rounds: EvaluationRound[];
}) {
  const { t } = useLingui();
  const prompt = blindQuestionText(item, blindContext);
  return (
    <>
      <section className="evaluation-question">
        <div className="evaluation-question-meta">
          <span>
            {item.id} · {item.family} · {item.split}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <CopyButton ariaLabel={t`Copy blind question`} copyContent={prompt} />
            <EvaluationAgentRetest caseId={item.id} prompt={prompt} />
          </div>
        </div>
        {item.blindFollowup ? (
          <p className="evaluation-prose">{prompt}</p>
        ) : (
          <>
            <h3>{item.question}</h3>
            {item.observations.length > 0 && (
              <ul>
                {Array.from(new Set(item.observations)).map((observation) => (
                  <li key={observation}>{observation}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <div className="evaluation-answers">
        {rounds.map((round) => (
          <Answer key={round.id} item={item} round={round} />
        ))}
      </div>
      <details className="evaluation-key">
        <summary>
          <BookOpen aria-hidden="true" className="size-4" />
          <Trans>Answer key and evidence</Trans>
        </summary>
        <h4>
          <Trans>Reference answer</Trans>
        </h4>
        <p className="evaluation-prose">{item.referenceAnswer}</p>
        <h4>
          <Trans>Rubric</Trans>
        </h4>
        <ul className="evaluation-rubric">
          {item.criteria.map((criterion) => (
            <li key={criterion.id}>
              <span>{criterion.text}</span>
              <small>
                <Trans>Weight</Trans> {criterion.weight}
                {criterion.critical && (
                  <>
                    {' '}
                    · <Trans>Critical</Trans>
                  </>
                )}
                {criterion.evidence.length > 0 && <> · {criterion.evidence.join(', ')}</>}
              </small>
            </li>
          ))}
        </ul>
        {item.reject.length > 0 && (
          <>
            <h4>
              <Trans>Disqualifying errors</Trans>
            </h4>
            <ul className="evaluation-list">
              {Array.from(new Set(item.reject)).map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        )}
        {item.evidence.length > 0 && (
          <>
            <h4>
              <Trans>Evidence</Trans>
            </h4>
            <dl className="evaluation-evidence">
              {item.evidence.map((source) => (
                <div key={source.id}>
                  <dt>
                    {source.id} · {source.source} · {source.section} · <Trans>Page</Trans>{' '}
                    {source.page}
                  </dt>
                  <dd>{source.anchor}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </details>
    </>
  );
}

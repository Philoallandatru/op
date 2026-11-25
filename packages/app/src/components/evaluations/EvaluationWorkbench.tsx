import { Trans, useLingui } from '@lingui/react/macro';
import { BookOpen, ChartNoAxesColumnIncreasing, FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EVALUATION_REPORT_MAX_BYTES,
  type EvaluationReport,
  parseEvaluationReport,
} from '@/lib/agent-evaluation-report';
import { useWorkspace } from '@/lib/use-workspace';
import { EvaluationComparison } from './EvaluationComparison';
import './evaluation-workbench.css';

let recent: { scope: string; report: EvaluationReport } | null = null;

async function loadSsdExample() {
  return (await import('./ssd-example-report.json?raw')).default;
}

export function EvaluationWorkbench() {
  const workspace = useWorkspace();
  const scope = workspace?.contentDir ?? null;
  const [session, setSession] = useState({ scope, key: 0 });
  if (session.scope !== scope) {
    setSession({ scope, key: session.scope === null ? session.key : session.key + 1 });
  }
  return <ImportPanel key={session.key} scope={scope} />;
}

function ImportPanel({ scope }: { scope: string | null }) {
  const { t } = useLingui();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  const [imported, setReport] = useState<EvaluationReport | null>(null);
  const report = imported ?? (recent?.scope === scope ? recent.report : null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (scope && imported) recent = { scope, report: imported };
  }, [scope, imported]);
  useEffect(
    () => () => {
      latest.current++;
    },
    [],
  );

  async function openReport(read: () => Promise<string>) {
    const attempt = ++latest.current;
    setError('');
    try {
      const parsed = parseEvaluationReport(await read());
      if (attempt !== latest.current) return;
      setReport(parsed);
      setRevision((value) => value + 1);
    } catch {
      if (attempt === latest.current) {
        setError(t`Could not open this evaluation report. Check the JSON format and version.`);
      }
    }
  }

  function openFile(file: File) {
    if (file.size > EVALUATION_REPORT_MAX_BYTES) {
      latest.current++;
      setError(t`Choose a report smaller than 8 MiB.`);
      return;
    }
    void openReport(() => file.text());
  }

  const importButton = (
    <Button
      type="button"
      variant={report ? 'outline' : 'default'}
      onClick={() => input.current?.click()}
    >
      <FileUp aria-hidden="true" />
      <Trans>Import report</Trans>
    </Button>
  );
  return (
    <section className="evaluation-workbench">
      <Input
        ref={input}
        hidden
        className="hidden"
        type="file"
        accept=".json,application/json"
        aria-label={t`Import report`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) openFile(file);
        }}
      />
      <header className="evaluation-heading">
        <div>
          <h2>
            <Trans>Agent evaluations</Trans>
          </h2>
          {report && <p>{report.title}</p>}
        </div>
        {report && importButton}
      </header>
      {error && (
        <p className="evaluation-error" role="alert">
          {error}
        </p>
      )}
      {report ? (
        <EvaluationComparison key={revision} report={report} />
      ) : (
        <div className="evaluation-empty">
          <ChartNoAxesColumnIncreasing
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h3>
            <Trans>Compare agent answers</Trans>
          </h3>
          <p>
            <Trans>
              Import a local evaluation JSON file to compare runs, review answers and inspect the
              evidence.
            </Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            {importButton}
            <Button type="button" variant="outline" onClick={() => void openReport(loadSsdExample)}>
              <BookOpen aria-hidden="true" />
              <Trans>Open SSD example</Trans>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

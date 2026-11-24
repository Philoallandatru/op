import { Trans } from '@lingui/react/macro';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EvaluationReport, EvaluationRound } from '@/lib/agent-evaluation-report';
import { blindRoundJsonl } from '@/lib/evaluation-blind-round';

export function EvaluationRetestExport({
  report,
  round,
}: {
  report: EvaluationReport;
  round: EvaluationRound;
}) {
  function download() {
    const file = new Blob([blindRoundJsonl(report, round)], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${round.id}-questions.jsonl`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Button type="button" variant="outline" onClick={download}>
      <Download aria-hidden="true" />
      <Trans>Export blind questions</Trans>
    </Button>
  );
}

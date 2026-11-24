import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { EvaluationReport, EvaluationResult } from '@/lib/agent-evaluation-report';
import { EvaluationWorkbench } from './EvaluationWorkbench';

const state = vi.hoisted(() => ({ scope: 'project-a' as string | null }));
vi.mock('@/lib/use-workspace', () => ({
  useWorkspace: () => (state.scope ? { contentDir: state.scope } : null),
}));

const question = {
  id: 'q1',
  family: 'timing',
  split: 'challenge',
  question: 'Can we release the job?',
  observations: ['The second check is running.'],
  referenceAnswer: 'Wait for both checks.',
  criteria: [
    { id: 'c1', text: 'Wait for completion.', weight: 1, critical: true, evidence: ['e1'] },
  ],
  reject: ['Assume both checks passed.'],
  evidence: [
    {
      id: 'e1',
      source: 'Operating guide',
      page: 11,
      section: '4.1',
      anchor: 'both checks complete',
    },
  ],
};
function result(ready: boolean): EvaluationResult {
  return {
    caseId: 'q1',
    status: 'completed',
    answer: ready ? 'Wait.' : 'Release the job.',
    seconds: 2,
    toolCalls: 1,
    readPages: [{ source: 'Operating guide', page: 11 }],
    review: {
      usability: ready ? 'ready' : 'misleading',
      reason: ready ? 'Action is supported.' : 'Too early.',
      otherError: '',
      credits: { c1: ready ? 1 : 0 },
      rejectHits: ready ? [] : [1],
      score: ready ? 100 : 0,
      passed: ready,
    },
  };
}
const pending: EvaluationResult = {
  caseId: 'q2',
  status: 'pending',
  answer: null,
  review: null,
  toolCalls: null,
  seconds: null,
};
const report: EvaluationReport = {
  schemaVersion: 1,
  title: 'Test observations',
  blindContext: { spec: 'Operating guide', protocol: 'operations', observationHeading: 'Observed' },
  cases: [
    question,
    {
      ...question,
      id: 'q2',
      question: 'Has the job finished?',
      blindFollowup: {
        caseId: 'q1',
        form: 2,
        question:
          'Can we release the job?\n\nObserved\n- The second check is running.\n\nLater\nBoth checks passed.\nWhat changes?',
      },
    },
  ],
  rounds: [
    { id: 'a', label: 'Standard', config: 'Original settings', results: [result(false)] },
    { id: 'b', label: 'Trace', config: 'Tool evidence', results: [result(true), pending] },
    { id: 'c', label: 'Checklist', config: 'Review settings', results: [result(true)] },
  ],
};

function mount() {
  return render(
    <TooltipProvider>
      <EvaluationWorkbench />
    </TooltipProvider>,
  );
}
function upload(text: string) {
  const file = Object.assign(new File([text], 'report.json'), { text: async () => text });
  fireEvent.change(screen.getByLabelText('Import report', { selector: 'input' }), {
    target: { files: [file] },
  });
}

afterEach(cleanup);

describe('agent evaluation workbench', () => {
  it('compares selected runs, distinguishes missing plans and verdicts, and copies only the initial case', async () => {
    state.scope = 'interaction';
    mount();
    upload(JSON.stringify(report));
    await screen.findByText('Test observations');
    const table = within(screen.getByRole('table', { name: 'Run metrics' }));
    expect(table.getAllByRole('row')).toHaveLength(4);
    expect(table.getByRole('row', { name: /Standard/ }).textContent).toContain('100%1 / 1');
    expect(screen.getByText('Release the job.')).toBeTruthy();
    expect(screen.getByText('Wait.')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Comparison run' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Trace' }));
    const cells = within(table.getByRole('row', { name: /Trace/ })).getAllByRole('cell');
    expect(cells[0]?.textContent).toBe('—1 / 2');
    expect(cells.at(-1)?.textContent).toBe('1');
    expect(screen.getByText('Became ready').parentElement?.textContent).toContain('1');
    const clipboard = vi.fn(async () => {});
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboard },
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy blind question' }));
      await waitFor(() =>
        expect(clipboard).toHaveBeenCalledWith(
          'Can we release the job?\n\nObserved\n- The second check is running.',
        ),
      );
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
    const key = screen.getByText('Answer key and evidence').closest('details');
    expect(key?.open).toBe(false);
    fireEvent.click(screen.getByText('Answer key and evidence'));
    expect(key?.open).toBe(true);
    expect(screen.getByText('both checks complete')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Question' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Has the job finished/ }));
    expect(screen.getByText('Not planned')).toBeTruthy();
    expect(screen.getByText('Pending run')).toBeTruthy();
  });

  it('copies the original follow-up text with the initial observation and the new measurement', async () => {
    state.scope = 'branch';
    mount();
    upload(JSON.stringify(report));
    await screen.findByText('Test observations');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Question' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Has the job finished/ }));
    const clipboard = vi.fn(async () => {});
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboard },
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy blind question' }));
      await waitFor(() =>
        expect(clipboard).toHaveBeenCalledWith(report.cases[1]?.blindFollowup?.question),
      );
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('keeps a valid report on invalid replacement and restores it only for the same project', async () => {
    state.scope = 'recovery';
    const view = mount();
    upload(JSON.stringify(report));
    await screen.findByText('Test observations');
    upload('{');
    await screen.findByRole('alert');
    expect(screen.getByText('Test observations')).toBeTruthy();
    view.unmount();
    const restored = mount();
    expect(screen.getByText('Test observations')).toBeTruthy();
    restored.unmount();
    state.scope = 'different-project';
    mount();
    expect(screen.queryByText('Test observations')).toBeNull();
    expect(screen.getByRole('button', { name: 'Import report' })).toBeTruthy();
  });

  it('retains imports made before workspace discovery and isolates a later workspace switch', async () => {
    state.scope = null;
    const view = mount();
    upload(JSON.stringify(report));
    await screen.findByText('Test observations');
    state.scope = 'resolved-project';
    view.rerender(
      <TooltipProvider>
        <EvaluationWorkbench />
      </TooltipProvider>,
    );
    expect(screen.getByText('Test observations')).toBeTruthy();
    state.scope = 'other-project';
    view.rerender(
      <TooltipProvider>
        <EvaluationWorkbench />
      </TooltipProvider>,
    );
    expect(screen.queryByText('Test observations')).toBeNull();
    state.scope = 'resolved-project';
    view.rerender(
      <TooltipProvider>
        <EvaluationWorkbench />
      </TooltipProvider>,
    );
    expect(screen.getByText('Test observations')).toBeTruthy();
  });
});

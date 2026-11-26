import { i18n } from '@lingui/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { EvaluationReport, EvaluationResult } from '@/lib/agent-evaluation-report';
import { EvaluationWorkbench } from './EvaluationWorkbench';

i18n.loadAndActivate({ locale: 'en', messages: {} });

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
  it('opens the bundled SSD example and displays its first recorded question', async () => {
    state.scope = 'ssd-example';
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Open SSD example' }));
    await screen.findByText('现场验收记录与同题耗时 · 第十六轮 16 道合成题 · 模型盲评');
    const table = within(screen.getByRole('table', { name: 'Run metrics' }));
    const baseline = within(
      table.getByRole('row', { name: /第九轮 · 核对边界与验收记录/ }),
    ).getAllByRole('cell');
    const candidate = within(
      table.getByRole('row', { name: /第十六轮 · 同次验收证据/ }),
    ).getAllByRole('cell');
    expect(table.getByRole('columnheader', { name: '验收可执行 / 计划' })).toBeTruthy();
    expect(baseline[0]?.textContent).toContain('14 / 16');
    expect(baseline[1]?.textContent).toContain('0 / 15');
    expect(baseline[4]?.textContent).toContain('15 / 16');
    expect(baseline[5]?.textContent).toContain('14 / 16');
    expect(baseline[6]?.querySelector('strong')?.textContent).toBe('14.12 sec');
    expect(candidate[0]?.textContent).toContain('16 / 16');
    expect(candidate[1]?.textContent).toContain('0 / 16');
    expect(candidate[4]?.textContent).toContain('16 / 16');
    expect(candidate[5]?.textContent).toContain('16 / 16');
    expect(candidate[6]?.querySelector('strong')?.textContent).toBe('12.805 sec');
    expect(
      screen.getByText(/SSD-F16-09 · pcie-st-device-specific-proof-same-tag-not-msix-source/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export blind questions' })).toBeTruthy();
  });

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

  it('reports full condition credit against the plan and waits for unfinished grades', async () => {
    state.scope = 'condition-metric';
    mount();
    upload(
      JSON.stringify({
        ...report,
        conditionMetric: { criterionId: 'c1', label: 'Conditions complete / planned' },
      }),
    );
    await screen.findByText('Test observations');
    const table = within(screen.getByRole('table', { name: 'Run metrics' }));
    expect(table.getByRole('columnheader', { name: 'Conditions complete / planned' })).toBeTruthy();
    const summary = (name: string) =>
      within(table.getByRole('row', { name: new RegExp(name) })).getAllByRole('cell')[4]
        ?.textContent;
    expect(summary('Standard')).toBe('0%0 / 1');
    expect(summary('Trace')).toBe('—1 / 2');
    expect(summary('Checklist')).toBe('100%1 / 1');
  });

  it('compares the latency of delivered answers and keeps timeouts out of the median', async () => {
    state.scope = 'latency-metric';
    mount();
    upload(
      JSON.stringify({
        ...report,
        latencyMetric: {
          label: 'Median delivery time',
          stages: { retrieval: 'Retrieval', draft: 'Drafting', review: 'Sign-off', other: 'Other' },
        },
        rounds: [
          {
            ...report.rounds[0],
            results: [
              {
                ...result(true),
                phaseSeconds: { retrieval: 0.25, draft: 0, review: 1.7, other: 0.05 },
              },
              { ...pending, status: 'incomplete', seconds: 120 },
            ],
          },
        ],
      }),
    );
    await screen.findByText('Test observations');
    const table = within(screen.getByRole('table', { name: 'Run metrics' }));
    expect(table.getByRole('columnheader', { name: 'Median delivery time' })).toBeTruthy();
    const measured = within(table.getByRole('row', { name: /Standard/ })).getAllByRole('cell')[4];
    expect(measured?.querySelector('strong')?.textContent).toBe('2 sec');
    expect(measured?.textContent).toContain('Drafting 0 sec');
    expect(measured?.textContent).toContain('Sign-off 1.7 sec');
  });

  it('charts same-question changes, opens case evidence from a row, and shows the iteration record', async () => {
    state.scope = 'latency-history';
    const timed = (caseId: string, seconds: number) => ({
      ...result(true),
      caseId,
      seconds,
      phaseSeconds: { retrieval: 0.25, draft: 0, review: seconds - 0.25, other: 0 },
    });
    const counts = { planned: 2, completed: 2, ready: 2, misleading: 0 };
    mount();
    upload(
      JSON.stringify({
        ...report,
        latencyMetric: {
          label: 'Median delivery time',
          stages: { retrieval: 'Retrieval', draft: 'Drafting', review: 'Sign-off', other: 'Other' },
        },
        pairedLatencyLimit: 2.5,
        iterationHistory: [
          {
            id: 'concise',
            title: 'First concise run',
            method: 'Deduplicate rules',
            progress: 'Replayed the paired runs',
            next: 'Check approvals',
            baseline: counts,
            candidate: counts,
            timedPairs: 2,
            medianDelta: 1,
          },
        ],
        rounds: [
          { ...report.rounds[0], results: [timed('q1', 2), timed('q2', 2)] },
          { ...report.rounds[2], results: [timed('q1', 5), timed('q2', 1)] },
        ],
      }),
    );
    const chart = within(await screen.findByRole('figure', { name: 'Paired latency' }));
    expect(chart.getByText('+1 sec')).toBeTruthy();
    expect(chart.getByText('Limit +2.5 sec')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Time by stage' })).toBeTruthy();
    fireEvent.click(chart.getByRole('button', { name: /^q2/ }));
    expect(chart.getByRole('button', { name: /^q2/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Question' }).textContent).toContain(
      'Has the job finished?',
    );
    fireEvent.click(screen.getByText('Iteration history'));
    expect(screen.getByText('Deduplicate rules')).toBeTruthy();
    expect(screen.getByText('Check approvals')).toBeTruthy();
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

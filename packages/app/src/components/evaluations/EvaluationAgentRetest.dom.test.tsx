import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { subscribeToAgentThreadLaunchRequests } from '@/components/handoff/thread-launch-events';
import type { RegisteredAgent } from '@/lib/acp/registered-agents';
import { openAgentEvaluations } from '@/lib/use-settings-route';
import { EvaluationAgentRetest } from './EvaluationAgentRetest';

const enabled: RegisteredAgent = { source: 'custom', id: 'alpha', name: 'Alpha' };
const project = { mode: 'editor', projectPath: '/workspace' };
const catalog = vi.hoisted(() => ({ agents: [] as RegisteredAgent[] }));
vi.mock('@/lib/acp/registered-agents', () => ({ useRegisteredAgents: () => catalog.agents }));
vi.mock('@/lib/acp/enabled-agents', async (original) => ({
  ...(await original<typeof import('@/lib/acp/enabled-agents')>()),
  useEnabledOverrides: () => ({ 'in-app:registry:off': false }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  catalog.agents = [];
});

test('hides retest when running in a browser or when no enabled desktop agent is available', () => {
  catalog.agents = [enabled];
  vi.stubGlobal('okDesktop', undefined);
  const view = render(<EvaluationAgentRetest caseId="q1" prompt="What changed?" />);
  expect(screen.queryByRole('button', { name: 'Ask an agent' })).toBeNull();
  vi.stubGlobal('okDesktop', { config: { mode: 'navigator' } });
  view.rerender(<EvaluationAgentRetest caseId="q1" prompt="What changed?" />);
  expect(screen.queryByRole('button', { name: 'Ask an agent' })).toBeNull();
  vi.stubGlobal('okDesktop', { config: { ...project, singleFile: true } });
  view.rerender(<EvaluationAgentRetest caseId="q1" prompt="What changed?" />);
  expect(screen.queryByRole('button', { name: 'Ask an agent' })).toBeNull();
  vi.stubGlobal('okDesktop', { config: project });
  catalog.agents = [
    { source: 'registry', id: 'unsupported', name: 'Unsupported', supported: false },
    { source: 'registry', id: 'off', name: 'Disabled' },
  ];
  view.rerender(<EvaluationAgentRetest caseId="q1" prompt="What changed?" />);
  expect(screen.queryByRole('button', { name: 'Ask an agent' })).toBeNull();
});

test('opens the chosen desktop agent with only the verbatim blind prompt and returns from settings', async () => {
  catalog.agents = [enabled, { source: 'registry', id: 'off', name: 'Disabled' }];
  vi.stubGlobal('okDesktop', { config: project });
  window.history.replaceState(null, '', '#/work');
  openAgentEvaluations();
  const launch = vi.fn();
  const stop = subscribeToAgentThreadLaunchRequests(launch);
  const prompt =
    'Can the job resume?\n\nObserved\n- The worker is idle.\n\nLater\n- Both checks passed.\nWhat changes?';
  try {
    render(<EvaluationAgentRetest caseId="q1" prompt={prompt} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ask an agent' }), { key: 'Enter' });
    const choice = await screen.findByRole('menuitem', { name: 'Alpha' });
    expect(screen.queryByRole('menuitem', { name: 'Disabled' })).toBeNull();
    expect(launch).not.toHaveBeenCalled();
    fireEvent.click(choice);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      agentSource: 'custom',
      agentId: 'alpha',
      prompt,
      titleHint: 'q1',
      docName: null,
      attachments: null,
    });
    await waitFor(() => expect(window.location.hash).toBe('#/work'));
  } finally {
    stop();
    window.history.replaceState(null, '', '/');
  }
});

test('launches from a direct settings link without going back to a previous page', async () => {
  catalog.agents = [enabled];
  vi.stubGlobal('okDesktop', { config: project });
  window.history.pushState(null, '', '#previous');
  window.history.pushState(null, '', '#settings/agent-evaluations');
  const back = vi.spyOn(window.history, 'back');
  try {
    render(<EvaluationAgentRetest caseId="q1" prompt="What changed?" />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ask an agent' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Alpha' }));
    expect(window.location.hash).toBe('');
    expect(back).not.toHaveBeenCalled();
  } finally {
    back.mockRestore();
    window.history.replaceState(null, '', '/');
  }
});

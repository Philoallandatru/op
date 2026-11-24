import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { EvaluationAnswerMarkdown } from './EvaluationAnswerMarkdown';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('formats the answer for comparison and retains the exact original for review', async () => {
  const markdown =
    '## Decision\n\n**Keep waiting** for the second observation.\n\n| Signal | Action |\n| --- | --- |\n| Ready | Resume |\n\n- Check `status`.';
  const { container } = render(<EvaluationAnswerMarkdown text={markdown} />);
  expect(screen.getByRole('heading', { name: 'Decision' })).toBeTruthy();
  expect(container.querySelector('strong')?.textContent).toBe('Keep waiting');
  expect(screen.getByRole('columnheader', { name: 'Signal' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: 'Resume' })).toBeTruthy();
  expect(container.querySelector('li code')?.textContent).toBe('status');
  fireEvent.click(screen.getByText('View source'));
  await waitFor(() => expect(container.querySelector('details pre')?.textContent).toBe(markdown));
});

test('displays resource references and raw markup as inert text without network access', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const markdown = [
    '![Inline diagram](https://example.invalid/diagram.png)',
    '![Trace image][trace]',
    '[trace]: https://example.invalid/trace.png',
    '[Investigation](https://github.com/example/example/issues/1)',
    '<iframe src="https://example.invalid/frame"></iframe>',
    '<img src="https://example.invalid/raw.png" alt="raw">',
  ].join('\n\n');
  const { container } = render(<EvaluationAnswerMarkdown text={markdown} />);
  const body = container.querySelector('.evaluation-markdown');
  expect(body?.textContent).toContain('Inline diagram');
  expect(body?.textContent).toContain('https://example.invalid/diagram.png');
  expect(body?.textContent).toContain('Trace image');
  expect(body?.textContent).toContain('https://example.invalid/trace.png');
  expect(body?.textContent).toContain('https://github.com/example/example/issues/1');
  expect(body?.textContent).toContain('<iframe');
  expect(
    container.querySelector('img, iframe, a, video, audio, object, link, script, [src], [href]'),
  ).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

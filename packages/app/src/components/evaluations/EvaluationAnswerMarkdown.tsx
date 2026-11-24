import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { type Components, Streamdown } from 'streamdown';

const elements = [
  'p',
  'em',
  'strong',
  'del',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ol',
  'ul',
  'li',
  'blockquote',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'code',
  'pre',
  'a',
  'img',
];

const components: Components = {
  a: ({ children, href }) => (
    <span>
      {children}
      {href && children !== href ? ` (${href})` : ''}
    </span>
  ),
  img: ({ alt, src }) => (
    <span>
      {alt}
      {alt && typeof src === 'string' ? ' · ' : ''}
      {typeof src === 'string' && src}
    </span>
  ),
  code: 'code',
  inlineCode: ({ children }) => <code>{children}</code>,
  strong: 'strong',
  em: 'em',
  pre: 'pre',
  table: 'table',
  h1: 'h4',
  h2: 'h4',
  h3: 'h5',
  h4: 'h5',
  h5: 'h6',
  h6: 'h6',
};

export function EvaluationAnswerMarkdown({ text }: { text: string }) {
  const [sourceOpen, setSourceOpen] = useState(false);
  return (
    <>
      <ErrorBoundary resetKeys={[text]} fallback={<p className="evaluation-prose">{text}</p>}>
        <Streamdown
          mode="static"
          className="evaluation-markdown"
          allowedElements={elements}
          components={components}
          controls={false}
          rehypePlugins={[]}
          remarkRehypeOptions={{
            handlers: { html: (_state, node) => ({ type: 'text', value: node.value }) },
          }}
          skipHtml
        >
          {text}
        </Streamdown>
      </ErrorBoundary>
      <details
        className="evaluation-source"
        onToggle={(event) => setSourceOpen(event.currentTarget.open)}
      >
        <summary>
          <Trans>View source</Trans>
        </summary>
        {sourceOpen && <pre>{text}</pre>}
      </details>
    </>
  );
}

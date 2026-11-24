import { Trans } from '@lingui/react/macro';
import { ChevronDown } from 'lucide-react';
import { requestAgentThreadLaunch } from '@/components/handoff/thread-launch-events';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { isInAppAgentEnabled } from '@/lib/acp/agent-visibility';
import { useEnabledOverrides } from '@/lib/acp/enabled-agents';
import { useRegisteredAgents } from '@/lib/acp/registered-agents';
import { closeSettings } from '@/lib/use-settings-route';

export function EvaluationAgentRetest({ prompt, caseId }: { prompt: string; caseId: string }) {
  const embedded = useIsEmbedded();
  const agents = useRegisteredAgents();
  const overrides = useEnabledOverrides();
  const desktop = window.okDesktop?.config;
  if (
    embedded ||
    !desktop?.projectPath ||
    desktop.singleFile ||
    (desktop.mode !== 'editor' && desktop.mode !== 'note')
  )
    return null;
  const enabled = agents.filter((agent) =>
    isInAppAgentEnabled(overrides, agent.source, agent.id, true, agent.supported),
  );
  if (!enabled.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" type="button">
          <Trans>Ask an agent</Trans>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {enabled.map((agent) => (
          <DropdownMenuItem
            key={`${agent.source}:${agent.id}`}
            onSelect={() => {
              closeSettings();
              requestAgentThreadLaunch({
                agentSource: agent.source,
                agentId: agent.id,
                prompt,
                docName: null,
                titleHint: caseId,
                attachments: null,
              });
            }}
          >
            {agent.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

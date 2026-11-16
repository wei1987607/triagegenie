// TriageGenie issue panel (UI Kit 2).
// Shows the triage for the issue on screen — category, priority, labels,
// suggested assignee, draft first response and fix plan — and lets the user
// apply it (labels + priority + assignee + first-response comment) with one
// click. The issue key comes from useProductContext; the heavy work happens
// in the resolver (src/index.ts) and the pure engine (src/triage.ts).

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Lozenge,
  SectionMessage,
  Stack,
  Strong,
  Text,
  useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import type { TriageResult } from '../triage';

type LozengeAppearance = 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success';

const PRIORITY_APPEARANCE: Record<TriageResult['priorityLabel'], LozengeAppearance> = {
  Highest: 'removed',
  High: 'moved',
  Medium: 'inprogress',
  Low: 'new',
  Lowest: 'default',
};

interface GetTriageResponse {
  triage?: TriageResult;
  error?: string;
}

interface ApplyTriageResponse {
  triage?: TriageResult;
  applied?: { labels: boolean; priority: boolean; assignee: boolean; comment: boolean };
  notes?: string[];
  error?: string;
}

const App = () => {
  const context = useProductContext();
  const issueKey =
    (context as unknown as { extension?: { issue?: { key?: string } } })?.extension?.issue?.key ?? null;

  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<boolean>(false);
  const [applied, setApplied] = useState<boolean>(false);
  const [applyNotes, setApplyNotes] = useState<string[]>([]);

  const fetchTriage = async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = (await invoke('getTriage', { issueKey: key })) as GetTriageResponse;
      if (res.error || !res.triage) {
        setError(res.error ?? 'Triage failed for an unknown reason.');
        setTriage(null);
      } else {
        setTriage(res.triage);
      }
    } catch (e) {
      setError(`Could not load triage: ${String((e as Error)?.message || e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (issueKey) void fetchTriage(issueKey);
    else {
      setLoading(false);
      setError('No issue on screen.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueKey]);

  const onApply = async () => {
    if (!issueKey || !triage) return;
    setApplying(true);
    try {
      const res = (await invoke('applyTriage', { issueKey })) as ApplyTriageResponse;
      if (res.error) {
        setError(res.error);
      } else {
        setApplied(true);
        setApplyNotes(res.notes ?? []);
        if (res.triage) setTriage(res.triage);
      }
    } catch (e) {
      setError(`Could not apply triage: ${String((e as Error)?.message || e)}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Stack space="space.200">
      <Heading as="h3">TriageGenie</Heading>

      {loading && <Text>Triaging this issue…</Text>}

      {error && (
        <SectionMessage appearance="error" title="Triage failed">
          <Text>{error}</Text>
        </SectionMessage>
      )}

      {applied && (
        <SectionMessage appearance="success" title="Triage applied">
          <Text>Labels, priority, assignee and the first-response comment were applied to this issue.</Text>
          {applyNotes.length > 0 && <Text>Notes: {applyNotes.join('; ')}</Text>}
        </SectionMessage>
      )}

      {triage && (
        <Stack space="space.200">
          <Inline space="space.100" alignBlock="center">
            <Lozenge appearance={PRIORITY_APPEARANCE[triage.priorityLabel]}>{triage.priorityLabel}</Lozenge>
            <Text>
              {triage.category} · score {triage.priorityScore}/100 · confidence {Math.round(triage.confidence * 100)}%
            </Text>
          </Inline>

          <Box>
            <Text>
              <Strong>Suggested labels:</Strong> {triage.labels.join(', ')}
            </Text>
          </Box>

          <Box>
            <Text>
              <Strong>Suggested assignee:</Strong>{' '}
              {triage.assignee ? `${triage.assignee.displayName} — ${triage.assignee.reason}` : triage.assigneeNote}
            </Text>
          </Box>

          {triage.similarIssues.length > 0 && (
            <Box>
              <Text>
                <Strong>Similar past issues:</Strong>{' '}
                {triage.similarIssues.map((s) => `${s.key} (${s.status})`).join(', ')}
              </Text>
            </Box>
          )}

          <Box>
            <Text>
              <Strong>Draft first response:</Strong>
            </Text>
            <Text>{triage.draftResponse}</Text>
          </Box>

          <Box>
            <Text>
              <Strong>Fix plan:</Strong>
            </Text>
            {triage.fixPlan.map((step, i) => (
              <Text key={i}>
                {i + 1}. {step}
              </Text>
            ))}
          </Box>

          <Box>
            <Text>
              <Strong>Why:</Strong> {triage.reasons.join('; ')}
            </Text>
          </Box>

          <Inline space="space.100">
            <Button appearance="primary" onClick={onApply} isDisabled={applying || applied}>
              {applying ? 'Applying…' : applied ? 'Applied' : 'Apply triage'}
            </Button>
            <Button appearance="subtle" onClick={() => issueKey && void fetchTriage(issueKey)} isDisabled={loading}>
              Re-triage
            </Button>
          </Inline>
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

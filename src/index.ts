// TriageGenie — Forge backend: resolver (issue panel), auto-triage trigger,
// and Rovo agent actions.
//
// All triage decisions live in ./triage (pure functions). This file only
// fetches data from Jira / Teamwork Graph and writes results back, so the
// decision logic is verified offline (scripts/smoke-test.ts) without an
// Atlassian account.

import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import Resolver from '@forge/resolver';
import {
  adfToText,
  buildSimilarJql,
  findSimilar,
  inferSkills,
  toAdf,
  triageIssue,
} from './triage';
import type { GraphContext, IssueInput, SimilarIssue, TeamMember, TriageResult } from './triage';
import { twgAll, Q, workItemAri } from './twg';

const log = (event: string, data: Record<string, unknown>): void =>
  console.log(JSON.stringify({ triagegenie: event, ...data }));

// ---------------------------------------------------------------------------
// Jira REST shapes (minimal — only the fields we read)
// ---------------------------------------------------------------------------

interface JiraIssueRest {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    issuetype?: { name?: string };
    labels?: string[];
    components?: { name?: string }[];
    reporter?: { displayName?: string; accountId?: string };
    assignee?: { displayName?: string; accountId?: string } | null;
    status?: { name?: string };
    project?: { key?: string };
  };
}

interface JiraUserRest {
  accountId: string;
  displayName?: string;
  active?: boolean;
  accountType?: string;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadIssue(key: string): Promise<{ issue: IssueInput; raw: JiraIssueRest } | { error: string }> {
  const res = await api
    .asUser()
    .requestJira(
      route`/rest/api/3/issue/${key}?fields=summary,description,issuetype,labels,components,reporter,assignee,status,project`,
    );
  if (res.status === 404) return { error: `${key} does not exist or you cannot see it.` };
  if (!res.ok) return { error: `Could not read ${key} (${res.status}).` };
  const raw = (await res.json()) as JiraIssueRest;
  const issue: IssueInput = {
    key: raw.key,
    summary: raw.fields.summary ?? raw.key,
    description: adfToText(raw.fields.description).trim() || undefined,
    issueType: raw.fields.issuetype?.name,
    labels: raw.fields.labels ?? [],
    components: (raw.fields.components ?? []).map((c) => c.name ?? '').filter(Boolean),
    reporter: raw.fields.reporter
      ? { displayName: raw.fields.reporter.displayName, accountId: raw.fields.reporter.accountId }
      : undefined,
  };
  return { issue, raw };
}

// Similar past issues via JQL, ranked by the same token similarity as the
// offline engine (so the panel, the trigger and the agent agree).
async function similarIssuesLive(
  issue: IssueInput,
  projectKey: string,
): Promise<{ similar: SimilarIssue[]; notes: string[] }> {
  const notes: string[] = [];
  const jql = buildSimilarJql(issue, projectKey);
  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/search/jql?jql=${jql}&fields=summary,status,resolution&maxResults=10`);
  if (!res.ok) {
    notes.push(`similar-issue search could not be read (${res.status})`);
    return { similar: [], notes };
  }
  const data = (await res.json()) as {
    issues?: {
      key: string;
      fields?: { summary?: string; status?: { name?: string }; resolution?: { name?: string } | null };
    }[];
  };
  const corpus = (data.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields?.summary ?? '',
    description: '',
    status: i.fields?.status?.name ?? '',
    resolution: i.fields?.resolution?.name ?? null,
  }));
  return { similar: findSimilar(issue, corpus, 3), notes };
}

// Teamwork Graph context for one issue: recent commenters, linked goals,
// linked docs (Jira remote links, e.g. Confluence pages).
async function graphContextLive(
  raw: JiraIssueRest,
  cloudId: string | undefined,
  similar: SimilarIssue[],
): Promise<GraphContext> {
  const notes: string[] = [];
  const ari = workItemAri(cloudId, raw.id);
  const [comments, goals] = await Promise.all([
    twgAll('workItemComments', Q.workItemComments, { id: ari, since: 'P90D' }, 'jiraWorkItemComments'),
    twgAll('workItemGoals', Q.workItemGoals, { id: ari }, 'jiraWorkItemGoals'),
  ]);
  if (!comments.ok) notes.push(`comments could not be read: ${comments.error}`);
  if (!goals.ok) notes.push(`goals could not be read: ${goals.error}`);

  const byAuthor = new Map<string, { name: string; comments: number; lastAt: string | null }>();
  for (const c of comments.nodes) {
    const author = ((c.author as { name?: string } | undefined)?.name ?? 'unknown') as string;
    const row = byAuthor.get(author) ?? { name: author, comments: 0, lastAt: null };
    row.comments += 1;
    const createdAt = typeof c.createdAt === 'string' ? (c.createdAt as string) : null;
    if (!row.lastAt || (createdAt && createdAt > row.lastAt)) row.lastAt = createdAt;
    byAuthor.set(author, row);
  }

  const linkedDocs: GraphContext['linkedDocs'] = [];
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/issue/${raw.key}/remotelink`);
    if (res.ok) {
      const links = (await res.json()) as { object?: { url?: string; title?: string } }[];
      for (const l of links) {
        if (l.object?.url) linkedDocs.push({ title: l.object.title ?? l.object.url, url: l.object.url });
      }
    } else {
      notes.push(`linked docs could not be read (${res.status})`);
    }
  } catch (e) {
    notes.push(`linked docs could not be read: ${String((e as Error)?.message || e)}`);
  }

  return {
    linkedDocs,
    similarIssues: similar,
    recentCommenters: [...byAuthor.values()].sort((a, b) => b.comments - a.comments),
    goals: goals.nodes
      .map((g) => ({ name: String(g.name ?? ''), url: String(g.url ?? '') }))
      .filter((g) => g.name),
    notes,
  };
}

// Live team: assignable users for the project, with workload + skills inferred
// from what Teamwork Graph says each person is currently assigned to.
// (Skills are inferred from recent work, not from a directory — Jira has no
// skill field. When the graph cannot be read, a member gets no skills and is
// only suggested if nothing better matches.)
const MAX_TEAM_CANDIDATES = 10;
const DEFAULT_MAX_LOAD = 5;

async function liveTeam(issue: IssueInput, projectKey: string): Promise<TeamMember[]> {
  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/user/assignable/search?project=${projectKey}&maxResults=${MAX_TEAM_CANDIDATES}`);
  if (!res.ok) return [];
  const users = (await res.json()) as JiraUserRest[];
  const active = users
    .filter((u) => u.active !== false && u.accountType !== 'app')
    .slice(0, MAX_TEAM_CANDIDATES);
  return Promise.all(
    active.map(async (u): Promise<TeamMember> => {
      const assigned = await twgAll(
        'assignedWork',
        Q.assignedWork,
        { userId: `ari:cloud:identity::user/${u.accountId}` },
        'atlassianUserAssignedJiraWorkItems',
        1,
      );
      const items = assigned.nodes as { key?: string; summary?: string; status?: { name?: string } }[];
      const open = items.filter((w) => w.status?.name && !/^(done|closed|resolved)$/i.test(w.status.name));
      const workText = items.map((w) => `${w.key ?? ''} ${w.summary ?? ''}`).join(' ');
      return {
        accountId: u.accountId,
        displayName: u.displayName ?? u.accountId,
        skills: inferSkills(workText),
        currentLoad: open.length,
        maxLoad: DEFAULT_MAX_LOAD,
      };
    }),
  );
}

// One full triage pass, shared by the panel, the trigger and the Rovo actions.
async function runTriage(
  issueKey: string,
  cloudId?: string,
): Promise<{ result: TriageResult; raw: JiraIssueRest } | { error: string }> {
  const loaded = await loadIssue(issueKey);
  if ('error' in loaded) return loaded;
  const { issue, raw } = loaded;
  const projectKey = raw.fields.project?.key ?? issueKey.split('-')[0];
  const { similar, notes: simNotes } = await similarIssuesLive(issue, projectKey);
  const context = await graphContextLive(raw, cloudId, similar);
  context.notes.push(...simNotes);
  const team = await liveTeam(issue, projectKey);
  const result = triageIssue(issue, team, context);
  return { result, raw };
}

// ---------------------------------------------------------------------------
// Applying a triage to Jira
// ---------------------------------------------------------------------------

interface ApplyOutcome {
  applied: { labels: boolean; priority: boolean; assignee: boolean; comment: boolean };
  notes: string[];
}

async function applyTriage(issueKey: string, result: TriageResult, raw: JiraIssueRest): Promise<ApplyOutcome> {
  const notes: string[] = [];
  const applied: ApplyOutcome['applied'] = { labels: false, priority: false, assignee: false, comment: false };

  const newLabels = [...new Set([...(raw.fields.labels ?? []), ...result.labels])];
  const updateRes = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { labels: newLabels, priority: { name: result.priorityLabel } } }),
  });
  if (updateRes.ok) {
    applied.labels = true;
    applied.priority = true;
  } else {
    notes.push(`could not set labels/priority (${updateRes.status})`);
  }

  if (result.assignee) {
    const assignRes = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/assignee`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: result.assignee.accountId }),
    });
    if (assignRes.ok) applied.assignee = true;
    else notes.push(`could not assign ${result.assignee.displayName} (${assignRes.status})`);
  }

  const commentRes = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: toAdf(result.draftResponse) }),
  });
  if (commentRes.ok) applied.comment = true;
  else notes.push(`could not post first response (${commentRes.status})`);

  try {
    await kvs.set(`triage:${issueKey}`, { ...result, triagedAt: new Date().toISOString() });
  } catch (e) {
    notes.push(`triage record could not be stored: ${String((e as Error)?.message || e)}`);
  }

  return { applied, notes };
}

// ---------------------------------------------------------------------------
// Resolver (issue panel)
// ---------------------------------------------------------------------------

function issueKeyFromResolver(req: { payload?: unknown; context?: unknown }): string | null {
  const p = (req.payload ?? {}) as { issueKey?: string };
  if (typeof p.issueKey === 'string' && p.issueKey.trim()) return p.issueKey.trim().toUpperCase();
  const c = req.context as
    | { extension?: { issue?: { key?: string } }; extensionContext?: { issueKey?: string } }
    | undefined;
  const k = c?.extension?.issue?.key ?? c?.extensionContext?.issueKey;
  return typeof k === 'string' && k.trim() ? k.trim().toUpperCase() : null;
}

function cloudIdFromContext(context: unknown): string | undefined {
  const c = context as { cloudId?: string } | undefined;
  return typeof c?.cloudId === 'string' ? c.cloudId : undefined;
}

const triageResolver = new Resolver();

triageResolver.define('getTriage', async (req) => {
  const key = issueKeyFromResolver(req);
  if (!key) return { error: 'No work item key. Open a Jira issue and try again.' };
  const out = await runTriage(key, cloudIdFromContext(req.context));
  if ('error' in out) return { error: out.error };
  return { triage: out.result };
});

triageResolver.define('applyTriage', async (req) => {
  const key = issueKeyFromResolver(req);
  if (!key) return { error: 'No work item key. Open a Jira issue and try again.' };
  const out = await runTriage(key, cloudIdFromContext(req.context));
  if ('error' in out) return { error: out.error };
  const applied = await applyTriage(key, out.result, out.raw);
  return { applied: applied.applied, notes: applied.notes, triage: out.result };
});

export const resolver = triageResolver.getDefinitions();

// ---------------------------------------------------------------------------
// Trigger — auto-triage on issue creation
// ---------------------------------------------------------------------------

export async function autoTriage(
  event: { issue?: { key?: string; id?: string } },
  context: { cloudId?: string },
): Promise<void> {
  const key = event?.issue?.key;
  if (!key) {
    log('auto-triage-skipped', { reason: 'no issue key in event' });
    return;
  }
  try {
    const out = await runTriage(key, context?.cloudId);
    if ('error' in out) {
      log('auto-triage-error', { key, error: out.error });
      return;
    }
    const applied = await applyTriage(key, out.result, out.raw);
    log('auto-triage', {
      key,
      category: out.result.category,
      score: out.result.priorityScore,
      assignee: out.result.assignee?.displayName ?? null,
      applied: applied.applied,
      notes: applied.notes,
    });
  } catch (e) {
    log('auto-triage-error', { key, error: String((e as Error)?.message || e) });
  }
}

// ---------------------------------------------------------------------------
// Rovo agent actions (GET only — agents triggered by automation rules will
// not call CREATE/UPDATE/DELETE actions; writes happen in the panel/trigger)
// ---------------------------------------------------------------------------

function actionIssueKey(payload: unknown): string | null {
  const p = (payload ?? {}) as { issueKey?: string; context?: { jira?: { issueKey?: string }; cloudId?: string } };
  const k = p.issueKey ?? p.context?.jira?.issueKey;
  return typeof k === 'string' && k.trim() ? k.trim().toUpperCase() : null;
}

function actionCloudId(payload: unknown): string | undefined {
  const p = (payload ?? {}) as { context?: { cloudId?: string } };
  return typeof p.context?.cloudId === 'string' ? p.context.cloudId : undefined;
}

export async function triageIssueAction(payload: unknown): Promise<Record<string, unknown>> {
  const key = actionIssueKey(payload);
  if (!key) return { error: 'Which work item? Give me a key such as PROJ-123.' };
  const out = await runTriage(key, actionCloudId(payload));
  if ('error' in out) return { error: out.error };
  return out.result as unknown as Record<string, unknown>;
}

export async function similarIssuesAction(payload: unknown): Promise<Record<string, unknown>> {
  const key = actionIssueKey(payload);
  if (!key) return { error: 'Which work item? Give me a key such as PROJ-123.' };
  const loaded = await loadIssue(key);
  if ('error' in loaded) return { error: loaded.error };
  const projectKey = loaded.raw.fields.project?.key ?? key.split('-')[0];
  const { similar, notes } = await similarIssuesLive(loaded.issue, projectKey);
  return { issueKey: key, similar, notes };
}

export async function suggestAssigneeAction(payload: unknown): Promise<Record<string, unknown>> {
  const key = actionIssueKey(payload);
  if (!key) return { error: 'Which work item? Give me a key such as PROJ-123.' };
  const out = await runTriage(key, actionCloudId(payload));
  if ('error' in out) return { error: out.error };
  return {
    issueKey: key,
    assignee: out.result.assignee,
    assigneeNote: out.result.assigneeNote,
    category: out.result.category,
    priorityScore: out.result.priorityScore,
  };
}

export async function draftResponseAction(payload: unknown): Promise<Record<string, unknown>> {
  const key = actionIssueKey(payload);
  if (!key) return { error: 'Which work item? Give me a key such as PROJ-123.' };
  const out = await runTriage(key, actionCloudId(payload));
  if ('error' in out) return { error: out.error };
  return {
    issueKey: key,
    draftResponse: out.result.draftResponse,
    category: out.result.category,
    priorityLabel: out.result.priorityLabel,
    similarIssues: out.result.similarIssues,
  };
}

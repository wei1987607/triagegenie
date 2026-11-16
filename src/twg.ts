// Teamwork Graph (TWG) client for Forge backend functions.
//
// Adapted from the verified pattern in the Codegeist 2026 tutorial
// ("build a Rovo agent on the Atlassian Teamwork Graph API in Forge",
// dev.to, Nov 2026 — the demo answered 4/4 questions on a live site):
//   - Every operation needs a name shaped `[company]_[operation]`
//     (company >= 3 chars, operation >= 4). Without it the API answers
//     HTTP 200 with a DataFetchingException, not a 4xx.
//   - Raw cypherQuery is refused for apps. Use curated queries (typed root
//     fields) — the five queries below are the curated ones from that demo.
//   - Curated connections return at most 25 rows per page. Page with `after`.
//   - A rate-limited call can come back with zero rows. Treat "empty plus
//     errors" as "could not read", never as "nothing there", and retry
//     transient errors with backoff.
//   - @forge/api exposes requestTeamworkGraph on asUser() only. asUser()
//     answers with what the person chatting can see. In @forge/api 8.4.0
//     typings AsAppFetchMethods has NO TeamworkGraphFetchMethods, so a
//     trigger (no user context) must skip graph calls, not attempt them.
//
// This client is NOT exercised against live data yet (no Atlassian account
// — see BUILD-LOG.md). The queries and the call shape are the verified ones;
// the first live run must confirm them against the site's TWG schema at
// https://<site>.atlassian.net/gateway/api/graphql/twg/schema.

import api from '@forge/api';

const OP_PREFIX = 'triagegenie_';

export const PAGE_SIZE = 25;

const TRANSIENT = /RATE_LIMIT|THROTTL|429|502|503|504/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const userAri = (accountId: string): string => `ari:cloud:identity::user/${accountId}`;

export const workItemAri = (cloudId: string | undefined, issueId: string): string =>
  `ari:cloud:jira:${cloudId ?? ''}:issue/${issueId}`;

export interface TwgResult {
  ok: boolean;
  data: Record<string, unknown> | null;
  error: string | null;
  ms: number;
}

// One GraphQL call as the user, with up to 3 retries on transient errors.
// Answers { ok, data, error, ms } and never throws. With opts.asApp the
// graph is skipped outright (requestTeamworkGraph is asUser-only) and the
// caller records the skip as a note instead of an error.
export async function twg(
  opName: string,
  query: string,
  variables: Record<string, unknown>,
  opts?: { asApp?: boolean },
): Promise<TwgResult> {
  if (opts?.asApp) {
    return { ok: false, data: null, error: 'teamwork-graph-as-app-unavailable', ms: 0 };
  }
  const operationName = `${OP_PREFIX}${opName}`;
  const text = query.replace('query OP', `query ${operationName}`);
  const t0 = Date.now();

  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let json: { errors?: { message?: string; extensions?: { classification?: string; errorType?: string } }[]; data?: Record<string, unknown> } | null = null;

    try {
      const res = await api.asUser().requestTeamworkGraph(text, variables, operationName);
      status = res.status;
      json = (await res.json().catch(() => null)) as typeof json;
    } catch (e) {
      json = { errors: [{ message: String((e as Error)?.message || e) }] };
    }

    const errors = Array.isArray(json?.errors) ? json.errors : [];
    const firstError = errors[0]
      ? `${errors[0].extensions?.classification || errors[0].extensions?.errorType || 'error'}: ${String(errors[0].message).slice(0, 160)}`
      : status >= 400
        ? `http-${status}`
        : null;

    if (!firstError && json?.data) return { ok: true, data: json.data, ms: Date.now() - t0, error: null };

    if (attempt < 3 && TRANSIENT.test(`${firstError} ${status}`)) {
      await sleep(Math.min(1200, 200 * 2 ** attempt) + Math.floor(Math.random() * 250));
      continue;
    }

    return { ok: false, error: firstError || 'no-data', data: json?.data || null, ms: Date.now() - t0 };
  }
}

export interface TwgPage {
  ok: boolean;
  nodes: Record<string, unknown>[];
  complete: boolean;
  error: string | null;
}

// Reads a curated connection page by page. `field` is the root field name.
// Answers { ok, nodes, complete, error }. complete=false means we stopped
// early (maxPages) or a page failed.
export async function twgAll(
  opName: string,
  query: string,
  variables: Record<string, unknown>,
  field: string,
  maxPages = 4,
  opts?: { asApp?: boolean },
): Promise<TwgPage> {
  const nodes: Record<string, unknown>[] = [];
  let after: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const r = await twg(opName, query, { ...variables, first: PAGE_SIZE, after }, opts);
    if (!r.ok) return { ok: nodes.length > 0, nodes, complete: false, error: r.error };
    const conn = r.data?.[field] as
      | { edges?: { node?: Record<string, unknown> }[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } }
      | undefined;
    if (!conn || !Array.isArray(conn.edges)) return { ok: false, nodes, complete: false, error: 'no-connection' };
    for (const e of conn.edges) if (e?.node) nodes.push(e.node);
    // Keep paging while the API says there is more, even when a page came back short.
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo?.endCursor) return { ok: true, nodes, complete: true, error: null };
    after = conn.pageInfo.endCursor;
  }

  return { ok: true, nodes, complete: false, error: 'stopped-after-max-pages' };
}

// Curated queries (typed root fields — no registration needed, no raw Cypher).
export const Q = {
  userTeams: `query OP($userId: ID!, $first: Int, $after: String) {
    atlassianUserInTeams(userId: $userId, first: $first, after: $after) {
      edges { node { ... on AtlassianTeam { id displayName } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
  teamMembers: `query OP($teamAri: ID!, $first: Int, $after: String) {
    atlassianTeamMembers(teamAri: $teamAri, first: $first, after: $after) {
      edges { node { ... on AtlassianUser { accountId name } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
  assignedWork: `query OP($userId: ID!, $first: Int, $after: String) {
    atlassianUserAssignedJiraWorkItems(userId: $userId, first: $first, after: $after) {
      edges { node { ... on JiraWorkItem { key summary webUrl status { name } } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
  workItemComments: `query OP($id: ID!, $since: String!, $first: Int, $after: String) {
    jiraWorkItemComments(id: $id, since: $since, first: $first, after: $after) {
      edges { node { ... on JiraWorkItemComment { createdAt author { name ... on AtlassianUser { accountId } } } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
  workItemGoals: `query OP($id: ID!, $first: Int, $after: String) {
    jiraWorkItemGoals(id: $id, first: $first, after: $after) {
      edges { node { ... on AtlassianGoal { name url } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
};

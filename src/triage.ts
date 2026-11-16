// TriageGenie — pure triage engine.
//
// No Atlassian API calls in this file: every function is deterministic and
// unit-testable against mock data (see src/mock-data.ts and
// scripts/smoke-test.ts). The Forge handlers in src/index.ts only fetch data
// and write results back; all decisions happen here, so the logic can be
// verified without an Atlassian account.

export type IssueCategory =
  | 'incident'
  | 'security'
  | 'bug'
  | 'feature'
  | 'task'
  | 'question'
  | 'docs';

export type PriorityLabel = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';

export interface IssueInput {
  key: string;
  summary: string;
  description?: string;
  issueType?: string;
  labels?: string[];
  components?: string[];
  reporter?: { displayName?: string; accountId?: string };
}

export interface TeamMember {
  accountId: string;
  displayName: string;
  skills: string[];
  currentLoad: number;
  maxLoad: number;
  onCall?: boolean;
}

export interface SimilarIssue {
  key: string;
  summary: string;
  status: string;
  similarity: number;
  resolution?: string | null;
}

export interface GraphContext {
  linkedDocs: { title: string; url: string }[];
  similarIssues: SimilarIssue[];
  recentCommenters: { name: string; comments: number; lastAt: string | null }[];
  goals: { name: string; url: string }[];
  notes: string[];
}

export interface AssigneeSuggestion {
  accountId: string;
  displayName: string;
  reason: string;
  score: number;
}

export interface TriageResult {
  key: string;
  category: IssueCategory;
  priorityScore: number; // 0-100
  priorityLabel: PriorityLabel;
  labels: string[];
  assignee: AssigneeSuggestion | null;
  assigneeNote: string;
  draftResponse: string;
  fixPlan: string[];
  confidence: number; // 0-1
  reasons: string[];
  similarIssues: SimilarIssue[];
}

export const EMPTY_GRAPH_CONTEXT: GraphContext = {
  linkedDocs: [],
  similarIssues: [],
  recentCommenters: [],
  goals: [],
  notes: [],
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  'a,an,the,and,or,of,to,in,on,for,with,at,by,from,as,is,are,was,were,be,been,it,its,this,that,these,those,i,you,we,they,he,she,my,your,our,their,have,has,had,do,does,did,can,could,should,would,will,not,no,yes,if,then,than,so,but,when,how,what,who,please,thanks,hi,hello,after,before,when,while,into,over,under,again,once,here,there,all,any,both,each,few,more,most,other,some,such,only,own,same,too,very,just'.split(
    ',',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
}

// Light stemming so "crashes" matches "crash" and "notifications" matches
// "notification". Porter-lite: -ches/-shes/-sses/-xes/-zes lose "es",
// other plurals lose a single "s".
function stem(word: string): string {
  if (word.length > 4 && /(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function issueText(issue: IssueInput): string {
  return [issue.summary, issue.description ?? '', ...(issue.components ?? [])].join(' ');
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const CATEGORY_RULES: { category: IssueCategory; patterns: RegExp[] }[] = [
  {
    category: 'security',
    patterns: [
      /security/i,
      /vulnerab/i,
      /breach/i,
      /exploit/i,
      /injection/i,
      /\bxss\b/i,
      /\bcsrf\b/i,
      /leak(ed)? (api key|token|secret|password)/i,
      /auth bypass/i,
    ],
  },
  {
    category: 'incident',
    patterns: [
      /outage/i,
      /\bdown\b/i,
      /unavailable/i,
      /5\d\d error/i,
      /service (is )?down/i,
      /production (is )?down/i,
      /sev[ -]?1/i,
      /all users/i,
      /cannot (pay|log ?in|check ?out)/i,
    ],
  },
  {
    category: 'bug',
    patterns: [
      /crash/i,
      /error/i,
      /fail(s|ed|ure)?/i,
      /broken/i,
      /\bbug\b/i,
      /wrong/i,
      /incorrect/i,
      /regress/i,
      /not working/i,
      /doesn.?t work/i,
    ],
  },
  {
    category: 'docs',
    patterns: [/typo/i, /documentation/i, /\bdocs?\b/i, /readme/i, /wording/i, /spelling/i],
  },
  {
    category: 'question',
    patterns: [/\bhow (do|can|to)\b/i, /\?$/, /\bwhat is\b/i, /\bcan you\b/i, /\bquestion\b/i],
  },
  {
    category: 'feature',
    patterns: [
      /feature/i,
      /add support/i,
      /please add/i,
      /\brequest\b/i,
      /enhancement/i,
      /would be (nice|great)/i,
    ],
  },
];

const ISSUE_TYPE_MAP: Record<string, IssueCategory> = {
  incident: 'incident',
  bug: 'bug',
  story: 'feature',
  'new feature': 'feature',
  feature: 'feature',
  task: 'task',
  subtask: 'task',
  epic: 'feature',
};

export function classifyIssue(issue: IssueInput): { category: IssueCategory; matched: string[] } {
  const text = issueText(issue);
  const matched: string[] = [];

  // Security and incident keywords always win — they are the ones that hurt.
  for (const rule of CATEGORY_RULES) {
    if (rule.category !== 'security' && rule.category !== 'incident') continue;
    for (const p of rule.patterns) {
      if (p.test(text)) {
        matched.push(`${rule.category}:${p.source}`);
        return { category: rule.category, matched };
      }
    }
  }

  // Otherwise the Jira issue type is the most reliable signal — except for
  // the generic types (Task/Subtask), where keywords say more than the type.
  const mapped = ISSUE_TYPE_MAP[(issue.issueType ?? '').toLowerCase()];
  if (mapped && mapped !== 'task') return { category: mapped, matched: [`issue-type:${issue.issueType}`] };

  for (const rule of CATEGORY_RULES) {
    for (const p of rule.patterns) {
      if (p.test(text)) {
        matched.push(`${rule.category}:${p.source}`);
        return { category: rule.category, matched };
      }
    }
  }
  return { category: 'task', matched: ['default:task'] };
}

// ---------------------------------------------------------------------------
// Priority scoring (transparent: every point is explained in `reasons`)
// ---------------------------------------------------------------------------

const URGENCY_BONUS: { points: number; label: string; patterns: RegExp[] }[] = [
  { points: 20, label: 'outage/crash/data-loss language', patterns: [/outage/i, /crash/i, /data loss/i, /\bdown\b/i] },
  { points: 20, label: 'security language', patterns: [/security/i, /vulnerab/i, /\bxss\b/i, /breach/i] },
  { points: 10, label: 'production/customer impact', patterns: [/production/i, /\bprod\b/i, /customer/i, /all users/i] },
  { points: 10, label: 'regression', patterns: [/regress/i] },
];

const CALM_DOWN: { points: number; label: string; patterns: RegExp[] }[] = [
  { points: -5, label: 'workaround exists', patterns: [/workaround/i] },
  { points: -10, label: 'cosmetic / nice-to-have language', patterns: [/typo/i, /wording/i, /nice to have/i, /cosmetic/i] },
];

const CATEGORY_BASE: Record<IssueCategory, number> = {
  incident: 35,
  security: 40,
  bug: 15,
  feature: 5,
  task: 5,
  question: 0,
  docs: 0,
};

export function priorityLabelFor(score: number): PriorityLabel {
  if (score >= 80) return 'Highest';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Lowest';
}

export function scorePriority(
  issue: IssueInput,
  category: IssueCategory,
): { score: number; reasons: string[] } {
  const text = issueText(issue);
  const reasons: string[] = [`category ${category} (base +${CATEGORY_BASE[category]})`];
  let score = 30 + CATEGORY_BASE[category];

  for (const rule of URGENCY_BONUS) {
    if (rule.patterns.some((p) => p.test(text))) {
      score += rule.points;
      reasons.push(`${rule.label} (+${rule.points})`);
    }
  }
  for (const rule of CALM_DOWN) {
    if (rule.patterns.some((p) => p.test(text))) {
      score += rule.points;
      reasons.push(`${rule.label} (${rule.points})`);
    }
  }
  if (!issue.description?.trim()) {
    score -= 5;
    reasons.push('no description — low signal (-5)');
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const LABEL_RULES: { label: string; patterns: RegExp[] }[] = [
  { label: 'crash', patterns: [/crash/i] },
  { label: 'outage', patterns: [/outage/i, /\bdown\b/i] },
  { label: 'security', patterns: [/security/i, /vulnerab/i, /\bxss\b/i] },
  { label: 'performance', patterns: [/slow/i, /performance/i, /timeout/i, /latency/i] },
  { label: 'ui', patterns: [/\bui\b/i, /button/i, /layout/i, /css/i] },
  { label: 'api', patterns: [/\bapi\b/i, /endpoint/i] },
  { label: 'billing', patterns: [/billing/i, /payment/i, /invoice/i, /charge/i] },
  { label: 'mobile', patterns: [/mobile/i, /\bios\b/i, /android/i] },
  { label: 'docs', patterns: [/typo/i, /documentation/i, /wording/i] },
  { label: 'onboarding', patterns: [/onboard/i, /sign ?up/i, /signup/i, /\bsso\b/i] },
  { label: 'data-loss', patterns: [/data loss/i, /lost data/i] },
];

export function suggestLabels(issue: IssueInput, category: IssueCategory): string[] {
  const text = issueText(issue);
  const labels = new Set<string>(['triagegenie', `category:${category}`]);
  for (const rule of LABEL_RULES) {
    if (rule.patterns.some((p) => p.test(text))) labels.add(rule.label);
  }
  return [...labels];
}

// ---------------------------------------------------------------------------
// Assignee suggestion — skill match minus workload, never at capacity
// ---------------------------------------------------------------------------

// Skill -> words in the issue text that prove the skill is needed.
const SKILL_ALIASES: Record<string, string[]> = {
  backend: ['backend', 'api', 'server', 'database', 'endpoint'],
  frontend: ['frontend', 'ui', 'button', 'layout', 'page', 'web', 'render'],
  mobile: ['mobile', 'android', 'ios', 'app'],
  payments: ['payment', 'payments', 'checkout', 'billing', 'invoice', 'charge'],
  security: ['security', 'xss', 'vulnerability', 'vulnerab', 'injection', 'csrf', 'breach'],
  infrastructure: ['infrastructure', 'deploy', 'outage', 'down', 'server', 'ops'],
  reports: ['report', 'reports', 'export', 'csv', 'dashboard'],
  docs: ['docs', 'documentation', 'typo', 'wording', 'guide', 'readme'],
  onboarding: ['onboard', 'signup', 'sign-up', 'sso', 'login'],
  support: ['support', 'sso', 'reset', 'question'],
};

// Which skill keys do the words in `text` call for?
export function inferSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [skill, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) found.push(skill);
  }
  return found;
}

function matchedSkills(issue: IssueInput, member: TeamMember): string[] {
  const needed = inferSkills(issueText(issue));
  return member.skills.filter((s) => needed.includes(s));
}

export function suggestAssignee(
  issue: IssueInput,
  team: TeamMember[],
  category: IssueCategory,
): { assignee: AssigneeSuggestion | null; note: string } {
  let best: { member: TeamMember; score: number; skills: string[] } | null = null;

  for (const member of team) {
    if (member.currentLoad >= member.maxLoad) continue; // at capacity — never suggest
    const skills = matchedSkills(issue, member);
    if (skills.length === 0) continue;
    let score = skills.length * 20;
    if (member.onCall && (category === 'incident' || category === 'security')) score += 15;
    score -= (member.currentLoad / member.maxLoad) * 15;
    if (!best || score > best.score) best = { member, score, skills };
  }

  if (!best) {
    const atCapacity = team.filter((m) => m.currentLoad >= m.maxLoad).map((m) => m.displayName);
    const note =
      atCapacity.length > 0
        ? `No available team member matches this issue. At capacity: ${atCapacity.join(', ')}.`
        : 'No team member matches this issue — needs a human to pick an owner.';
    return { assignee: null, note };
  }

  const { member, score, skills } = best;
  return {
    assignee: {
      accountId: member.accountId,
      displayName: member.displayName,
      reason: `Matched skills: ${skills.join(', ')}; open load ${member.currentLoad}/${member.maxLoad}${member.onCall ? '; on call' : ''}.`,
      score: Math.round(score),
    },
    note: '',
  };
}

// ---------------------------------------------------------------------------
// Similar issues — token Jaccard over summary + description
// ---------------------------------------------------------------------------

export function findSimilar(
  issue: IssueInput,
  corpus: { key: string; summary: string; description?: string; status: string; resolution?: string | null }[],
  topN = 3,
): SimilarIssue[] {
  const tokens = new Set(tokenize(issueText(issue)));
  if (tokens.size === 0) return [];
  const scored = corpus
    .filter((c) => c.key !== issue.key)
    .map((c) => {
      const other = new Set(tokenize(`${c.summary} ${c.description ?? ''}`));
      let overlap = 0;
      for (const t of tokens) if (other.has(t)) overlap++;
      const similarity = overlap / new Set([...tokens, ...other]).size;
      return { key: c.key, summary: c.summary, status: c.status, similarity, resolution: c.resolution ?? null };
    })
    .filter((r) => r.similarity > 0.1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
  return scored.map((r) => ({ ...r, similarity: Math.round(r.similarity * 100) / 100 }));
}

// JQL for the live lookup (used by src/index.ts against Jira REST).
export function buildSimilarJql(issue: IssueInput, projectKey: string): string {
  const tokens = tokenize(issueText(issue)).slice(0, 4);
  const clauses = tokens.map((t) => `summary ~ "${t}"`).join(' OR ');
  const base = clauses ? `(${clauses})` : 'summary ~ "the"';
  return `project = ${projectKey} AND ${base} AND key != ${issue.key} ORDER BY updated DESC`;
}

// ---------------------------------------------------------------------------
// Draft first response + fix plan
// ---------------------------------------------------------------------------

const FIX_PLANS: Record<IssueCategory, string[]> = {
  incident: [
    'Confirm scope: which users and services are affected',
    'Check the status page and the most recent deploys for the cause',
    'Mitigate first (rollback / failover) before root-causing',
    'Post updates on this issue as the situation changes',
    'Write a post-incident review once resolved',
  ],
  security: [
    'Confirm the vulnerability and its blast radius — do not share exploit details publicly',
    'Assess exposed data and rotate any leaked secrets',
    'Ship a fix behind a flag, then verify with a re-test',
    'Notify affected users if data was exposed',
    'Add a regression test and review similar code paths',
  ],
  bug: [
    'Reproduce with the reported steps',
    'Check similar past issues for a known cause',
    'Locate the failing code path',
    'Fix and add a regression test',
    'Verify in staging, then release and confirm with the reporter',
  ],
  feature: [
    'Clarify the use case and acceptance criteria',
    'Check for existing similar requests',
    'Estimate scope and prioritise against the roadmap',
    'Design, implement and document the change',
  ],
  task: [
    'Break the work into checkable steps',
    'Do the work',
    'Get a review and close with a note on what changed',
  ],
  question: [
    'Answer the question on this issue',
    'Point to the relevant docs',
    'If the docs are missing, file a docs follow-up',
  ],
  docs: [
    'Fix the wording',
    'Check neighbouring pages for the same mistake',
    'Get a quick review and publish',
  ],
};

export function draftFirstResponse(
  issue: IssueInput,
  result: Pick<TriageResult, 'category' | 'priorityLabel' | 'priorityScore' | 'assignee'>,
  similar: SimilarIssue[],
): string {
  const lines: string[] = [
    `Hi — thanks for raising this. We've triaged ${issue.key} as ${result.category} (priority ${result.priorityLabel}, ${result.priorityScore}/100).`,
    '',
    `What we understood: ${issue.summary}`,
  ];
  if (similar.length > 0) {
    lines.push('', `Similar past work: ${similar.map((s) => `${s.key} (${s.status})`).join(', ')}.`);
  }
  if (result.assignee) {
    lines.push('', `Owner: ${result.assignee.displayName} — they'll pick this up next.`);
  } else {
    lines.push('', 'Owner: not assigned yet — a human will pick an owner.');
  }
  lines.push('', "We'll update this issue here as we work on it.");
  return lines.join('\n');
}

// Convert plain-text draft to Jira ADF (the format /rest/api/3 comment needs).
export function toAdf(text: string): Record<string, unknown> {
  const paragraphs = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    version: 1,
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p }],
    })),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function triageIssue(
  issue: IssueInput,
  team: TeamMember[],
  context: GraphContext = EMPTY_GRAPH_CONTEXT,
): TriageResult {
  const { category, matched } = classifyIssue(issue);
  const { score, reasons } = scorePriority(issue, category);
  const labels = suggestLabels(issue, category);
  const { assignee, note } = suggestAssignee(issue, team, category);
  const similar = context.similarIssues ?? [];

  const partial = { category, priorityLabel: priorityLabelFor(score), priorityScore: score, assignee };
  const draftResponse = draftFirstResponse(issue, partial, similar);

  let confidence = 0.55;
  if (issue.description?.trim()) confidence += 0.1;
  confidence += Math.min(0.2, matched.length * 0.05);
  if (issue.summary.trim().length < 10) confidence -= 0.15;
  if (similar.length > 0) confidence += 0.05;
  confidence = Math.max(0.3, Math.min(0.95, Math.round(confidence * 100) / 100));

  return {
    key: issue.key,
    category,
    priorityScore: score,
    priorityLabel: priorityLabelFor(score),
    labels,
    assignee,
    assigneeNote: note,
    draftResponse,
    fixPlan: FIX_PLANS[category],
    confidence,
    reasons,
    similarIssues: similar,
  };
}

// Convert Jira ADF (rich text) back to plain text.
export function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text') return typeof n.text === 'string' ? n.text : '';
  if (!Array.isArray(n.content)) return '';
  const sep = n.type === 'paragraph' || n.type === 'heading' ? '\n' : '';
  return n.content.map(adfToText).join('') + sep;
}

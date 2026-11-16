// TriageGenie offline smoke test.
// Exercises the pure triage engine (src/triage.ts) against mock data — no
// Atlassian account, no network calls to Atlassian. Run with `npm test`.
// Exits non-zero on the first failed assertion.

import {
  adfToText,
  buildSimilarJql,
  findSimilar,
  inferSkills,
  toAdf,
  triageIssue,
} from '../src/triage';
import { MOCK_CORPUS, MOCK_GRAPH_CONTEXT_PAY101, MOCK_ISSUES, MOCK_TEAM } from '../src/mock-data';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function byKey(key: string) {
  const issue = MOCK_ISSUES.find((i) => i.key === key);
  if (!issue) throw new Error(`mock issue ${key} missing`);
  return issue;
}

console.log('TriageGenie smoke test — offline, mock data only\n');

console.log('[1] Production outage (PAY-101)');
{
  const r = triageIssue(byKey('PAY-101'), MOCK_TEAM, MOCK_GRAPH_CONTEXT_PAY101);
  check('category is incident', r.category === 'incident', `got ${r.category}`);
  check('priority score >= 80', r.priorityScore >= 80, `got ${r.priorityScore}`);
  check('priority label Highest', r.priorityLabel === 'Highest', `got ${r.priorityLabel}`);
  check('labels include outage', r.labels.includes('outage'), `got ${r.labels.join(',')}`);
  check('labels include triagegenie', r.labels.includes('triagegenie'));
  check('assignee is Ana Ruiz (on call)', r.assignee?.displayName === 'Ana Ruiz', `got ${r.assignee?.displayName ?? 'none'}`);
  check('draft mentions the key', r.draftResponse.includes('PAY-101'));
  check('draft mentions similar issue PAY-88', r.draftResponse.includes('PAY-88'));
  check('fix plan has >= 4 steps', r.fixPlan.length >= 4, `got ${r.fixPlan.length}`);
  check('similar issues carried through', r.similarIssues.some((s) => s.key === 'PAY-88'));
}

console.log('[2] Security report (SEC-77)');
{
  const r = triageIssue(byKey('SEC-77'), MOCK_TEAM);
  check('category is security', r.category === 'security', `got ${r.category}`);
  check('priority score >= 80', r.priorityScore >= 80, `got ${r.priorityScore}`);
  check('labels include security', r.labels.includes('security'));
  check('assignee is Priya Sharma', r.assignee?.displayName === 'Priya Sharma', `got ${r.assignee?.displayName ?? 'none'}`);
  check('fix plan mentions rotating secrets', r.fixPlan.some((s) => /rotat/i.test(s)));
}

console.log('[3] Mobile crash (MOB-55) — capacity rule');
{
  const r = triageIssue(byKey('MOB-55'), MOCK_TEAM);
  check('category is bug', r.category === 'bug', `got ${r.category}`);
  check('priority score >= 60', r.priorityScore >= 60, `got ${r.priorityScore}`);
  check('labels include crash + mobile', r.labels.includes('crash') && r.labels.includes('mobile'));
  check('assignee is Sara Kim (Marco is at capacity)', r.assignee?.displayName === 'Sara Kim', `got ${r.assignee?.displayName ?? 'none'}`);
}

console.log('[4] Feature request (FEAT-12)');
{
  const r = triageIssue(byKey('FEAT-12'), MOCK_TEAM);
  check('category is feature', r.category === 'feature', `got ${r.category}`);
  check('score is below High', r.priorityScore < 60, `got ${r.priorityScore}`);
  check('assignee is Sara Kim', r.assignee?.displayName === 'Sara Kim', `got ${r.assignee?.displayName ?? 'none'}`);
}

console.log('[5] Docs typo (DOC-9)');
{
  const r = triageIssue(byKey('DOC-9'), MOCK_TEAM);
  check('category is docs', r.category === 'docs', `got ${r.category}`);
  check('priority score < 40', r.priorityScore < 40, `got ${r.priorityScore}`);
  check('labels include docs', r.labels.includes('docs'));
  check('assignee is Tom Becker', r.assignee?.displayName === 'Tom Becker', `got ${r.assignee?.displayName ?? 'none'}`);
}

console.log('[6] Support question (SUP-31)');
{
  const r = triageIssue(byKey('SUP-31'), MOCK_TEAM);
  check('category is question', r.category === 'question', `got ${r.category}`);
  check('draft is non-empty', r.draftResponse.length > 40);
  check('fix plan is the question plan', r.fixPlan[0].startsWith('Answer the question'));
}

console.log('[7] Vague issue with no description (VAGUE-1)');
{
  const r = triageIssue(byKey('VAGUE-1'), MOCK_TEAM);
  check('still produces a draft', r.draftResponse.length > 40);
  check('still produces a fix plan', r.fixPlan.length >= 3);
  check('confidence is low (< 0.7)', r.confidence < 0.7, `got ${r.confidence}`);
}

console.log('[8] Capacity rule — Marco Chen is never suggested');
{
  for (const issue of MOCK_ISSUES) {
    const r = triageIssue(issue, MOCK_TEAM);
    check(`${issue.key}: assignee is not Marco Chen`, r.assignee?.displayName !== 'Marco Chen');
  }
}

console.log('[9] Invariants across all mock issues');
{
  for (const issue of MOCK_ISSUES) {
    const r = triageIssue(issue, MOCK_TEAM);
    check(`${issue.key}: labels include triagegenie`, r.labels.includes('triagegenie'));
    check(`${issue.key}: fix plan >= 3 steps`, r.fixPlan.length >= 3);
    check(`${issue.key}: score in 0-100`, r.priorityScore >= 0 && r.priorityScore <= 100);
    check(`${issue.key}: confidence in 0.3-0.95`, r.confidence >= 0.3 && r.confidence <= 0.95);
  }
}

console.log('[10] Similarity search');
{
  const similar = findSimilar(byKey('MOB-55'), MOCK_CORPUS);
  check('top match is MOB-41', similar[0]?.key === 'MOB-41', `got ${similar[0]?.key ?? 'none'}`);
  check('top similarity > 0.25', (similar[0]?.similarity ?? 0) > 0.25, `got ${similar[0]?.similarity}`);
  check('MOB-38 also found', similar.some((s) => s.key === 'MOB-38'));
  const none = findSimilar(byKey('DOC-9'), MOCK_CORPUS);
  check('unrelated issue finds only the docs match', none.length <= 1);
}

console.log('[11] JQL builder');
{
  const jql = buildSimilarJql(byKey('PAY-101'), 'PAY');
  check('excludes the issue itself', jql.includes('key != PAY-101'), jql);
  check('orders by updated desc', jql.includes('ORDER BY updated DESC'));
  check('scopes to the project', jql.startsWith('project = PAY'), jql);
}

console.log('[12] Helpers');
{
  check('inferSkills finds payments + backend', (() => {
    const s = inferSkills('checkout API returns 500');
    return s.includes('payments') && s.includes('backend');
  })());
  const adf = toAdf('Hello\n\nSecond paragraph');
  check('toAdf builds a doc with 2 paragraphs', (adf.content as unknown[]).length === 2);
  check(
    'adfToText round-trips',
    adfToText({ version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }).trim() === 'Hello',
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log('SMOKE TEST FAILED');
  process.exit(1);
}
console.log('SMOKE TEST PASSED');

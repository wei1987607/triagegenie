// Mock data for offline verification of the TriageGenie engine.
// These stand in for live Jira issues + a Teamwork Graph context until the
// Atlassian developer site exists. Nothing here is real customer data.

import type { GraphContext, IssueInput, TeamMember } from './triage';

export const MOCK_TEAM: TeamMember[] = [
  {
    accountId: '557058:aaaaaaaa-0001',
    displayName: 'Priya Sharma',
    skills: ['backend', 'payments', 'security'],
    currentLoad: 3,
    maxLoad: 5,
  },
  {
    accountId: '557058:aaaaaaaa-0002',
    displayName: 'Marco Chen',
    skills: ['frontend', 'mobile', 'reports'],
    currentLoad: 5,
    maxLoad: 5, // at capacity — TriageGenie must never suggest him
  },
  {
    accountId: '557058:aaaaaaaa-0003',
    displayName: 'Ana Ruiz',
    skills: ['backend', 'infrastructure', 'payments'],
    currentLoad: 2,
    maxLoad: 5,
    onCall: true,
  },
  {
    accountId: '557058:aaaaaaaa-0004',
    displayName: 'Tom Becker',
    skills: ['docs', 'onboarding', 'support'],
    currentLoad: 1,
    maxLoad: 5,
  },
  {
    accountId: '557058:aaaaaaaa-0005',
    displayName: 'Sara Kim',
    skills: ['frontend', 'mobile', 'reports'],
    currentLoad: 2,
    maxLoad: 5,
  },
];

export const MOCK_ISSUES: IssueInput[] = [
  {
    key: 'PAY-101',
    summary: 'Production checkout is down — customers cannot pay',
    description:
      'Since 14:02 UTC the /checkout API returns 500 errors for every request. All customers are affected; no workaround. Last deploy was 13:47.',
    issueType: 'Incident',
    components: ['Checkout'],
  },
  {
    key: 'SEC-77',
    summary: 'Possible XSS in comment rendering',
    description:
      'The /rest/api/3/comment API endpoint renders user comments without escaping — a <script> tag in a comment executes in the victim browser. Security vulnerability, needs a fix before it is exploited.',
    issueType: 'Bug',
    components: ['Web'],
  },
  {
    key: 'MOB-55',
    summary: 'App crashes on launch after 2.4.0 update (Android)',
    description:
      'After updating to 2.4.0 the Android app crashes on launch every time. Reproducible on Pixel 8, Android 14. Clearing app data does not help.',
    issueType: 'Bug',
    components: ['Mobile'],
  },
  {
    key: 'FEAT-12',
    summary: 'Add CSV export to the reports page',
    description:
      'As a finance user I want to export the reports page as CSV so I can reconcile numbers in a spreadsheet. Please add an export button.',
    issueType: 'Story',
    components: ['Reporting'],
  },
  {
    key: 'DOC-9',
    summary: "Typo in the getting-started guide ('recieve' → 'receive')",
    description: 'The onboarding guide spells "receive" as "recieve" in step 3. Small wording fix.',
    issueType: 'Task',
    components: ['Docs'],
  },
  {
    key: 'SUP-31',
    summary: 'How do I reset the SSO connection for my team?',
    description: 'Our SSO connection stopped working after the IdP certificate rotated. How do I reset it?',
    issueType: 'Task',
    components: ['Web'],
  },
  {
    key: 'VAGUE-1',
    summary: 'It broke',
    description: '',
    issueType: 'Bug',
  },
];

// Past issues the similarity search can find (status + resolution included).
export const MOCK_CORPUS = [
  {
    key: 'MOB-41',
    summary: 'App crashes on launch (iOS) after 2.3.0 update',
    description: 'After updating to 2.3.0 the iOS app crashes on launch every time.',
    status: 'Done',
    resolution: 'Fixed in 2.3.1 — bad migration in the local database.',
  },
  {
    key: 'MOB-38',
    summary: 'Crash when opening notifications',
    description: 'The app crashes when the user taps a push notification.',
    status: 'Done',
    resolution: 'Fixed — null push payload.',
  },
  {
    key: 'PAY-88',
    summary: 'Checkout 500 errors during deploy',
    description: 'Checkout API returned 500 errors for all customers during the deploy window.',
    status: 'Done',
    resolution: 'Rolled back the deploy; added a deploy freeze check.',
  },
  {
    key: 'DOC-4',
    summary: 'Typo in the API reference',
    description: 'The API reference spells "authentication" wrong in two places.',
    status: 'Done',
    resolution: 'Fixed.',
  },
];

// A Teamwork Graph context as the live actions would assemble it.
export const MOCK_GRAPH_CONTEXT_PAY101: GraphContext = {
  linkedDocs: [
    { title: 'Checkout incident runbook', url: 'https://example.atlassian.net/wiki/runbook-checkout' },
    { title: 'Deploy freeze policy', url: 'https://example.atlassian.net/wiki/deploy-freeze' },
  ],
  similarIssues: [
    { key: 'PAY-88', summary: 'Checkout 500 errors during deploy', status: 'Done', similarity: 0.55, resolution: 'Rolled back the deploy.' },
  ],
  recentCommenters: [
    { name: 'Ana Ruiz', comments: 4, lastAt: '2026-11-16T13:50:00Z' },
    { name: 'Priya Sharma', comments: 2, lastAt: '2026-11-16T13:20:00Z' },
  ],
  goals: [{ name: 'Checkout reliability 99.95%', url: 'https://example.atlassian.net/goals/1' }],
  notes: [],
};

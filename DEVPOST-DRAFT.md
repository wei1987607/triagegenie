# Devpost submission draft — TriageGenie (Atlassian Codegeist 2026)

Submit under **weirongcheng9** (https://devpost.com/weirongcheng9).
Hackathon: https://codegeist2026.devpost.com/
**Deadline: Dec 23, 2026 04:00 Beijing** (Dec 22, 15:00 ET).
**Category: Apps for Software Teams.**
**Bonus prizes: Best Agents (Rovo), Best app with Atlassian MCP, Best apps with
Teamwork Graph integration.** (Not Marketplace — the app is not published there.)

## Title
TriageGenie

## Tagline
Jira triage that runs itself — every new issue classified, prioritised and answered in seconds.

## Links
- Judges' install link: (see repo DEPLOY-STATUS.md — full signed URL; do NOT paste it into chat)
- GitHub: https://github.com/wei1987607/triagegenie (public, Apache-2.0)
- Demo video: (YouTube link — fill in after upload; must be PUBLIC per Codegeist rules, under 5 minutes)
- Live demo site: https://weirongcheng9.atlassian.net (Jira Free; the app is installed there)

## Built with
Forge, Jira, Rovo, Teamwork Graph, Atlassian MCP, UI Kit 2, TypeScript, React

## Description (paste into Devpost)

### Inspiration
Every new Jira issue is a small job in itself: someone has to read it,
decide what kind of work it is, judge how urgent it is, find the right
person, and write the first reply to the reporter. On a busy team that
triage queue is where issues go to wait. TriageGenie does the whole first
pass the moment an issue is created — and shows its working, so a human can
trust it, check it, or overrule it in one click.

### What it does
- **Auto-triage on creation:** a Forge trigger fires on every new issue and
  applies labels, sets the priority, and posts a drafted first response as a
  comment — verified live in about 11 seconds.
- **Classification into 7 categories** — incident, security, bug, feature,
  task, question, docs — with security and incident keywords always winning.
- **Priority score 0–100 with reasons:** every point is listed in the panel
  (e.g. "category incident (base +35); outage language (+20)"), so the score
  is explainable, not a black box.
- **Suggested labels** (`triagegenie`, `category:<x>`, plus `crash`,
  `security`, `billing`, … from keyword rules).
- **Suggested assignee:** skill match against the issue text and components,
  minus current workload, plus an on-call bonus for incidents. It never
  suggests someone already at capacity — and it says so when nobody matches.
- **Draft first response + fix plan:** a reply to the reporter and
  category-specific next steps (incidents get mitigate-first, security gets
  rotate-secrets).
- **Issue panel:** open any issue and the TriageGenie panel shows the full
  triage; one click on Apply writes labels, priority, assignee and the first
  response to the issue — and it never posts the same comment twice.
- **Grounded in Teamwork Graph:** similar past issues, recent commenters,
  linked goals and linked docs are read through curated GraphQL queries, so
  the app says "this part may be incomplete" when a source could not be
  read, instead of inventing an answer.
- **Rovo agent + MCP:** the same four actions (triage an issue, find similar
  issues, suggest an assignee, draft a response) are a Rovo agent and an MCP
  server, so Rovo Studio custom agents and MCP-compatible clients can use
  them too.

### How I built it
A Forge app (TypeScript + React + UI Kit 2). The modules are
`jira:issuePanel` for the panel, a trigger on `avi:jira:created:issue` for
auto-triage, `rovo:agent` with four actions, and `rovo:mcp` exposing the same
actions as MCP tools. All triage decisions live in `src/triage.ts` — pure,
deterministic functions with no API calls, covered by 84 offline tests
against mock data. The Forge handlers only fetch data (Jira REST + Teamwork
Graph via `src/twg.ts`: named operations, 25-row paging, retries with
backoff) and write results back. One subtlety the build surfaced: a trigger
invocation has no user context, so Jira calls on the trigger path use
`api.asApp()`, while the panel and Rovo actions keep `api.asUser()`.

### How it meets the technology requirement
Built on Forge and integrated with Jira (issue panel + trigger), Teamwork
Graph (curated queries for teams, members, assigned work, comments and
goals), Rovo (agent + actions) and MCP (the same tools exposed as an MCP
server). The Teamwork Graph context is what makes the triage grounded rather
than guessed: similar issues come from a real JQL + similarity search, and
assignee skills are inferred from what people are actually assigned to.

### Challenges
- **The trigger "never fired":** it did fire — and died with a 401. A
  trigger has no user, so `api.asUser()` has no auth type available. The fix
  was to use `api.asApp()` on the trigger path (Teamwork Graph is asUser-only,
  so graph calls are skipped there with a recorded note).
- **The panel refused to render:** Forge UI Kit 2 rejects native HTML, and
  the panel used `<strong>` in six places. Replaced with the `@forge/react`
  `Strong` component.
- **Apply posted the first response twice:** the trigger and the panel call
  the same apply function, which posted unconditionally. Apply now reads the
  issue's existing comments first and skips the post when the first response
  is already there (exact-text or signature match).

### Accomplishments
Verified live end to end on a real Jira Free site: a fresh issue is
auto-triaged in ~11 seconds (labels + one bot comment), the panel renders
with the full score breakdown, and Apply lands the changes without ever
double-posting. 84 unit tests and 56 manifest checks pass; `forge lint` is
clean. The judges' install link is live (Sharing with anyone, Jira only).

### Honest note on Rovo
The Rovo agent (`rovo:agent` + four actions) and the MCP server are part of
the app, but the demo site is Jira Free, which has no Rovo — so the video
demonstrates the trigger and the panel, which are what a Free site can show.
Judges installing on a site with Rovo can try the agent there. Nothing in
the video is faked: every frame is the real app on the live site.

### What's next
- Show the Rovo agent live on a site that has Rovo.
- Richer fix plans generated from the similar-issues context.
- Confluence linked-docs context via a native Teamwork Graph query.

## Testing instructions (for judges)
1. Install from the installation link above (Jira only, free).
2. Create a new issue in any project — within a minute it gets labels
   (`triagegenie`, `category:<x>`), a priority, and a first-response comment.
3. Open the issue → TriageGenie panel (issue menu → View app actions) →
   see the score breakdown, suggested labels, assignee note, draft reply and
   fix plan → click Apply triage.
4. No login beyond your own Atlassian site is needed; the app needs no
   configuration.

## Cover image
Use a real screenshot of the TriageGenie panel on a live issue once
available (preferred); fallback is `demo-video/cover.png` (title card).

## Checklist before submitting
- [ ] YouTube demo link added above (PUBLIC, under 5 min — Codegeist requires public)
- [ ] Judges' install link pasted (from repo DEPLOY-STATUS.md)
- [ ] Cover image uploaded
- [ ] Category: Apps for Software Teams; bonus prizes: Rovo / MCP / Teamwork Graph
- [ ] Submit as weirongcheng9

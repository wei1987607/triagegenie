# TriageGenie

A Forge app + Rovo agent that triages Jira issues — built for
**Atlassian Codegeist 2026** ($120,000, closes Dec 22, 2026 12:00 PT).

**Category:** Apps for Software Teams.
**Bonus prizes targeted:** Best Agents (Rovo), Best app with Atlassian MCP,
Best apps with Teamwork Graph integration. (One entry can win one grand prize
and one bonus prize.)

## What it does

A new Jira issue arrives. TriageGenie:

1. **Classifies it** — incident / security / bug / feature / task / question / docs.
2. **Scores its priority 0–100** with a transparent, explainable formula
   (every point is listed in the panel as a reason, e.g. "category incident
   (base +35); outage language (+20)").
3. **Suggests labels** (`triagegenie`, `category:<x>`, plus `crash`,
   `security`, `billing`, … from keyword rules).
4. **Suggests an assignee** — skill match against the issue text and
   components, minus current workload, plus an on-call bonus for incidents.
   It never suggests someone already at capacity.
5. **Drafts a first response** to the reporter and a **fix plan** (steps
   differ by category — incidents get mitigate-first, security gets
   rotate-secrets).
6. **Grounds everything in Teamwork Graph** — similar past issues, recent
   commenters, linked goals and linked docs — so the agent says "this part
   may be incomplete" when a source could not be read, instead of inventing
   an answer.

Three ways to use it:

| Surface | How |
|---|---|
| **Issue panel** (`jira:issuePanel`) | Open any issue → TriageGenie panel shows the triage → one click applies labels + priority + assignee + first-response comment. |
| **Auto-triage** (`trigger` on `avi:jira:created:issue`) | Every new issue is triaged the moment it is created. |
| **Rovo agent** (`rovo:agent` + `rovo:mcp`) | Chat with TriageGenie in Rovo ("Triage this issue", "Who should fix this?", "Find similar past issues"). The same four actions are exposed as MCP tools for Rovo Studio custom agents and MCP-compatible clients. |

## How the triage works

All decisions live in `src/triage.ts` — pure, deterministic functions with
no API calls, so they are unit-tested offline (`npm test`, 77 assertions
against mock data). The Forge handlers in `src/index.ts` only fetch data
(Jira REST + Teamwork Graph) and write results back.

- **Classification:** security/incident keywords always win; otherwise the
  Jira issue type decides (except generic Task, where keywords decide).
- **Priority:** base 30 + category base (incident +35, security +40, bug +15,
  feature/task +5) + urgency keywords (outage/crash/data-loss +20, security
  +20, production/customer +10, regression +10) − calm-down signals
  (workaround −5, cosmetic −10, no description −5). Bands: ≥80 Highest,
  ≥60 High, ≥40 Medium, ≥20 Low, else Lowest.
- **Assignee:** each skill match +20, on-call +15 for incident/security,
  minus load (`currentLoad/maxLoad × 15`). Members at capacity are skipped.
  Skills are inferred from what a person is currently assigned to (Teamwork
  Graph `assignedWork`), because Jira has no skill field.
- **Similar issues:** JQL text search for candidates, ranked by token
  Jaccard similarity (light stemming, e.g. crashes → crash).
- **Teamwork Graph:** curated GraphQL queries only (`atlassianUserInTeams`,
  `atlassianTeamMembers`, `atlassianUserAssignedJiraWorkItems`,
  `jiraWorkItemComments`, `jiraWorkItemGoals`) via `src/twg.ts` — named
  operations (`triagegenie_<operation>`), 25-row paging, retries with
  backoff, and "could not read" notes instead of silent empty answers.
  Raw Cypher is refused for apps; the broad `read:graph:jira` scope is
  retired, so only per-object scopes are requested.

## Project structure

```
manifest.yml            # modules, permissions, resources (app.id is a placeholder
                        # until `forge register` — see below)
prompts/prompt.md       # Rovo agent prompt (loaded as a resource)
src/
  triage.ts             # pure triage engine (classify/score/labels/assignee/
                        # similar/draft/fix-plan) — fully tested offline
  mock-data.ts          # 7 sample issues + 5-person team + graph context
  twg.ts                # Teamwork Graph client (curated queries, paging, retry)
  index.ts              # Forge handlers: resolver (panel), auto-triage trigger,
                        # 4 Rovo actions; applies triage via Jira REST + @forge/kvs
  frontend/index.tsx    # UI Kit 2 issue panel (@forge/react 12)
scripts/
  smoke-test.ts         # offline engine tests (77 assertions, mock data only)
  validate-manifest.ts  # offline manifest validator (56 checks; see BUILD-LOG.md)
```

## Local verification (no Atlassian account needed)

```bash
npm install           # note: keytar needs libsecret — see BUILD-LOG.md
npm run typecheck     # tsc --noEmit, strict
npm test              # smoke test: 77 assertions, mock data only
npm run validate-manifest
npm run verify        # all three
```

`npm run lint` (`forge lint`) **cannot run yet**: Forge CLI 15 requires a
login before any command, and the Atlassian developer account does not exist
yet (see BUILD-LOG.md for the full story and the offline validator that
replaces it for now).

## Setup once the Atlassian account exists

1. Create the free Atlassian Cloud developer site, then:
   ```bash
   forge register     # writes the real app id into manifest.yml
   forge deploy -e production
   forge install      # an org admin installs it and approves the graph scopes
   ```
2. **Rovo caveat:** Rovo is paid-only — a free site may not have it. A
   Standard or Premium trial includes Rovo. Installing an app with Teamwork
   Graph scopes needs an organization admin.
3. For the judges' installation link: deploy to production, then in the
   developer console → Distribution → Sharing → pick Jira → copy the link.
   (Do not pick "Sharing within organization", and do not submit the app for
   Marketplace listing — either blocks the installation link.)

## Demo script (video < 5 min)

1. (0:00) Create `PAY-101` "Production checkout is down" — the trigger
   fires: labels `triagegenie, category:incident, outage`, priority Highest,
   assignee Ana (on call), first-response comment posted.
2. (1:00) Open the issue panel: show the score breakdown (95/100), the
   similar past issue `PAY-88`, and the fix plan.
3. (2:00) Rovo chat: "Find similar past issues for MOB-55" → agent returns
   `MOB-41` (fixed in 2.3.1); "Who should fix SEC-77?" → Priya (security).
4. (3:00) Show the capacity rule: Marco Chen is at capacity, so the mobile
   crash goes to Sara Kim instead.
5. (3:45) MCP: the same tools listed in Rovo Studio; close with the install
   link + repo.

## Honest limitations

- The Teamwork Graph queries and the `requestTeamworkGraph` call shape follow
  a tutorial verified on a live site in Oct 2026, but this app has not run
  against live data yet — the first deploy must confirm them against the
  site's TWG schema (`https://<site>.atlassian.net/gateway/api/graphql/twg/schema`).
- The Confluence "linked docs" context comes from Jira remote links, not a
  native TWG Confluence query (whose exact curated field names were not
  confirmed from the docs).
- Assignee skills are inferred from recent assigned work, not from a skills
  directory — the panel always shows the reason so a human can overrule it.
- `forge lint` / `forge deploy` / live Jira verification are all blocked on
  the Atlassian developer account (see BUILD-LOG.md).

## License

Apache-2.0. See LICENSE.

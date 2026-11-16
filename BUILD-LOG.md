# TriageGenie — build log

**Built:** 2026-11-16 (local scaffold, no Atlassian account yet).
**Hackathon:** Atlassian Codegeist 2026 — $120k, submissions close Dec 23, 2026 04:00 Beijing.
**Category:** Apps for Software Teams. **Bonuses targeted:** Best Agents (Rovo),
Best app with Atlassian MCP, Best apps with Teamwork Graph integration.
**Spec:** `~/workspace/hackathons/bounty-platforms-plan.md` §3 (Forge app + Rovo
agent triaging Jira issues via Teamwork Graph + Atlassian MCP).

## What was built

Scaffolded the full Forge app at `~/workspace/hackathons/codegeist/triagegenie`:

- `manifest.yml` — `jira:issuePanel` (UI Kit 2), `trigger` on
  `avi:jira:created:issue`, `rovo:agent` (TriageGenie + 4 actions),
  `rovo:mcp` (same 4 actions as tools), 6 `function` modules, 12 scopes
  (Jira read/write + `storage:app` + 6 per-object Teamwork Graph scopes;
  the retired broad `read:graph:jira` scope is deliberately absent).
  `app.id` is a placeholder — see "Still needs the Atlassian account".
- `src/triage.ts` — pure triage engine: classification, transparent 0–100
  priority scoring with reasons, label rules, assignee suggestion (skill
  match − workload, on-call bonus, never at capacity), token-Jaccard
  similarity search + JQL builder, draft first response, per-category fix
  plans, ADF conversion helpers. No API calls — fully testable offline.
- `src/mock-data.ts` — 7 sample issues (outage, XSS, mobile crash, feature,
  typo, SSO question, vague no-description issue), a 5-person team (one
  member at capacity, to prove the capacity rule), a similar-issue corpus,
  and a mock Teamwork Graph context.
- `src/twg.ts` — Teamwork Graph client following the verified pattern from
  the Codegeist 2026 tutorial (dev.to, Nov 2026): named operations
  (`triagegenie_<operation>`), 25-row paging, retries with backoff, "could
  not read" instead of silent empty answers; 5 curated queries.
- `src/index.ts` — Forge handlers: `resolver` (panel `getTriage` /
  `applyTriage`), `autoTriage` trigger, 4 Rovo actions (all GET). Applies
  triage via Jira REST (labels + priority + assignee + first-response
  comment as ADF) and records it with `@forge/kvs`. Live team is built from
  assignable users with workload/skills inferred from Teamwork Graph.
- `src/frontend/index.tsx` — UI Kit 2 issue panel (`@forge/react` 12):
  score/category/confidence, labels, assignee + reason, similar issues,
  draft response, fix plan, reasons, Apply / Re-triage buttons.
- `prompts/prompt.md` — Rovo agent prompt (resource file, as the tutorial does).
- `scripts/smoke-test.ts` — 77 offline assertions against mock data.
- `scripts/validate-manifest.ts` — 56 offline manifest checks (see below).
- `README.md` — setup, demo script, honest limitations. `LICENSE` — Apache-2.0.

## Verification results

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`, strict) | ✅ PASS | exit 0, no errors |
| `npm test` (smoke test) | ✅ PASS | **77 passed, 0 failed** |
| `npm run validate-manifest` | ✅ PASS | **56 passed, 0 failed** (1 expected warning: `app.id` placeholder) |
| `npm run lint` (`forge lint`) | ❌ BLOCKED | Forge CLI 15 requires a login before any command; login is forbidden by this task's limits (see below). Not attempted. |
| Live Jira / deploy / tunnel | ❌ BLOCKED | No Atlassian account, no site. No live calls made. |

## Bugs found and fixed during verification

1. **Smoke test 5/77 failed on first run** — all engine logic, all fixed:
   - Issue type `Task` overrode keyword classification (typo → `task`,
     question → `task`). Fixed: generic types fall through to keyword rules.
   - `support` skill alias `help` was too broad ("does not help" matched a
     support person for a mobile crash). Removed `help`/`how` from the alias
     list; the crash now goes to the mobile engineer.
   - Similarity search missed `MOB-38` (no stemming: "crash" vs "crashes").
     Added light stemming + lowered the threshold 0.15 → 0.10.
2. **`@forge/react` 1.1.0 is stale** (no `Stack`/`Inline`/`Lozenge`/
   `useProductContext`, broken JSX types). Upgraded to **12.5.0** (current);
   all components and hooks now resolve.
3. **Legacy `storage` module removed from `@forge/api` 8.5.0** (changelog:
   "Remove storage module from @forge/api"). Triage records now use
   **`@forge/kvs`** (`kvs.set`), which is the current API; `storage:app`
   scope already in the manifest.
4. **`SectionMessage` appearance `"confirmation"`** is UI Kit 1; UI Kit 2
   uses `"success"`. Fixed.
5. **`twg.ts` success returns omitted `error: null`** (strict interface).
   Fixed.
6. **`npm install` failed on `keytar`** (native dep of `@forge/cli`):
   `libsecret-1` not found. Fixed with `sudo apt-get install libsecret-1-dev`
   (after `apt-get update`) + `npm rebuild keytar`; keytar now loads.
7. **`forge lint` environment chain** (all local, no Atlassian involved):
   - `EPERM chown ~/.config/@forge/...` (root-owned config dir) → worked
     around with `XDG_CONFIG_HOME=/tmp/forgeconfig`.
   - Interactive analytics prompt in non-TTY → answered via a PTY
     (`script -qec`); it defaulted to Yes.
   - `Keytar error: Cannot autolaunch D-Bus without X11 $DISPLAY` →
     installed `gnome-keyring` and ran it inside `dbus-run-session`.
   - Final blocker: **"Not logged in"** — the CLI loads credentials before
     every command, and `forge lint` has no offline mode. **Stopped here:
     no login attempt was made**, per the task's hard limits.

## Still needs the Atlassian account (ordered)

1. **Free Atlassian Cloud developer site** (currently blocked: the
   `weirongcheng9` Google password was rejected; do not retry password login).
2. `forge register` — replaces the placeholder `app.id` in `manifest.yml`.
3. `forge deploy -e production` + `forge install` (org admin approves the
   Teamwork Graph scopes).
4. **Live verification** (first deploy must confirm):
   - the 5 curated Teamwork Graph queries against the site's TWG schema
     (`https://<site>.atlassian.net/gateway/api/graphql/twg/schema`);
   - the trigger on a real new issue (labels/priority/assignee/comment);
   - the issue panel rendering + Apply flow;
   - the Rovo agent answering the 4 demo questions.
   **Rovo caveat:** Rovo is paid-only — a free site may not have it; a
   Standard or Premium trial includes Rovo.
5. Distribution: installation link for judges (Sharing, Jira) — see README.
6. Demo video (< 5 min, public YouTube) following `README.md`'s script.
7. Devpost submission (account `weirongcheng9`, category Apps for Software
   Teams + bonus selections) by **Dec 23, 2026 04:00 Beijing**.

## Environment notes (VM quirks, for the next session)

- `XDG_CONFIG_HOME=/tmp/forgeconfig` is required for every `forge` CLI call
  (the default `~/.config/@forge` dir is root-owned and `chown` fails).
  The token there is ephemeral — re-login after VM restart if a login ever
  exists. `forge` also needs a D-Bus session + `gnome-keyring-daemon`
  running for keytar (Secret Service), otherwise it errors before doing
  anything.
- `npm install` must be run with `--ignore-scripts` on first pass (keytar
  native build), then `npm rebuild keytar` after `libsecret-1-dev` is
  installed. Both packages are now installed system-wide, so future
  installs should work.
- No credentials, API keys, or payments were used or stored anywhere in
  this project. No network calls to Atlassian were made.

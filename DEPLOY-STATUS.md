# TriageGenie deploy status — 2026-11-16

## Environment (done, durable)
- Forge CLI **15.1.0** installed globally (`npm i -g @forge/cli --ignore-scripts`).
  - Plain install fails: postinstall hits `EPERM chown` on
    `~/.config/@forge/cli-nodejs/config.json.tmp-*` (container root lacks
    CAP_CHOWN for group changes; config file was `root:nogroup`).
  - Fix applied: `chown root:root` on `~/.config/@forge/cli-nodejs/config.json`
    and its directory. CLI commands now run clean.
- CLI analytics disabled: `forge settings set usage-analytics false`
  (also avoids an interactive consent prompt that cannot render here).

## Auth — DO NOT run `forge login` on this VM
- `forge login` fails: no local keychain ("couldn't securely store your login
  credentials in a local keychain. Ensure you have libsecret installed").
- WORKAROUND (verified): skip `forge login`; set env vars
  `FORGE_EMAIL=bnb69228@gmail.com` + `FORGE_API_TOKEN=<Forge API token>`
  on every forge command. Auth works.
- The Forge API token ("Forge CLI" label, all 16 Forge scopes, expires
  2027-11-16) was created 2026-11-16 via browser task; its value is NOT
  recorded in this repo or in memory. If it is lost, create a new one at
  https://go.atlassian.com/forge-cli-api-token (as bnb69228@gmail.com).
- Developer Space: "kiki ki", id d4ac43af-6d0f-422b-b139-f4841361a7d9
  (created in the developer console; the CLI has no create command).

## ✅ REGISTERED + DEPLOYED + INSTALLED (2026-11-16 ~16:35)
- App registered: TriageGenie, app id
  `ari:cloud:ecosystem::app/822e6b7d-3afe-401b-a26a-2ed420fef57d`
- Deployed to production, version **2.0.0** ("✔ Deployed").
- Installed in Jira on **https://weirongcheng9.atlassian.net**:
  installation id 54b88a44-10a6-4a16-a2ee-af7471050897, status Up-to-date
  (`forge install -e production -s weirongcheng9.atlassian.net -p Jira
  --confirm-scopes --non-interactive`).
- `forge logs -e production` is empty — no invocation has happened yet.

## Manifest fixes (commits 95c48a6, a584e26)
- `forge lint` failed with 3 errors; root causes found in the CLI's bundled
  schema (`@forge/manifest/.../manifest-schema.json`) and the Forge docs:
  1. `triage-issue` action `description` was 282 chars; action descriptions
     have maxLength 255. Shortened to 231 chars (same meaning). This single
     violation also caused the "action required properties" oneOf error.
  2. `jira:issuePanel` requires `icon` (schema: string 1–255). Added
     `icon: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg`
     — Atlassian's own documented example icon. A generic app icon is shown
     if it fails to load; swap for a custom icon later if wanted.
- `forge deploy` then failed bundling: "TypeScript emitted no output for
  src/index.ts" — tsconfig had `"noEmit": true`, which ts-loader obeys.
  Set `"noEmit": false` in tsconfig.json (the `typecheck` script still runs
  `tsc --noEmit` explicitly, so local checks are unchanged). Verify suite
  still passes (56/56 manifest checks).
- `forge deploy` also hit the EPERM chown quirk on
  `~/.config/PERMISSIONS_LINTER-nodejs` — fixed with the same
  `chown root:root` + `chmod g+s` as the CLI config dir.

## ⏳ LIVE VERIFICATION — NOT DONE YET (needs a browser)
Nothing has invoked the app yet, so the following must be checked in Jira
on weirongcheng9.atlassian.net (cloud browser as bnb69228@gmail.com):
1. Create a test issue in the sample CPG project (e.g. a bug report) and
   wait ~1 min: the auto-triage trigger (avi:jira:created:issue) should
   apply labels + priority and post the draft first response as a comment.
   This also exercises the 5 Teamwork Graph queries in src/twg.ts
   (userTeams, teamMembers, assignedWork, workItemComments, workItemGoals).
2. Open the issue → open the TriageGenie panel (••• menu) → check it
   renders category / priority score / labels / assignee / draft response /
   fix plan → click Apply → check the changes land on the issue.
3. Rovo demo: open Rovo and try the TriageGenie agent ("Triage this
   issue", "Who should fix this?", "Find similar past issues"). EXPECTED
   CAVEAT: Rovo is paid-only and this is a Jira Free site, so the agent
   may not appear at all — report exactly what is there; do not remove
   features without approval.
4. After the checks, run `forge logs -e production` to confirm invocations
   succeeded (the resolver logs JSON lines with `triagegenie:` prefix).
5. Delete the test issue(s) afterwards if wanted.

## Still needed for the Codegeist submission
- Judges' install link: generate it in the developer console (logged in as
  bnb69228@gmail.com) at
  https://developer.atlassian.com/console/myapps/822e6b7d-3afe-401b-a26a-2ed420fef57d/manage/distribution
  — there is no CLI command for this.
- Demo video (<5 min), Devpost submit by Dec 23, 2026 04:00 Beijing.

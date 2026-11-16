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

## ✅ DEPLOYED v2.2.0 + INSTALLED, Up-to-date (2026-11-16 ~17:10)
- Fix for the duplicate-comment bug below deployed to production
  (commit 0505565); `forge install list` confirms installation
  54b88a44-10a6-4a16-a2ee-af7471050897 is **Up-to-date** on
  weirongcheng9.atlassian.net (production version 2.2.0).
- Live verification of v2.2.0 still needed in the browser (see below).

## ❌ LIVE RE-VERIFICATION v2.1.0 (2026-11-16 17:02, browser, CPG-8) + FIX
- **Core flow WORKS**: auto-triage fired on new test issue CPG-8
  ("测试2：提交订单时提示系统错误") — labels `category:task` +
  `triagegenie` applied, bot first-response comment posted, panel
  renders with no error, Apply shows the green "Triage applied"
  confirmation. `forge logs` record: `{"triagegenie":"auto-triage",
  "key":"CPG-8","category":"task","score":35,"assignee":null,
  "applied":{"labels":true,"priority":true,"assignee":false,
  "comment":true},"notes":[]}`.
- **Bug — Apply posted the draft comment a second time**: the issue
  ended up with two identical first-response comments (the auto-triage
  bot one, plus one posted as the applying user kiki ki).
  **Root cause (confirmed in code)**: `applyTriage` in src/index.ts
  unconditionally POSTed the comment, and both the trigger
  (`autoTriage`) and the panel resolver call the same function.
  **Fix (commit 0505565)**: `applyTriage` now fetches the issue's
  existing comments first (`GET /rest/api/3/issue/{key}/comment`) and
  skips the post when the first response is already there — detected
  by `isDuplicateFirstResponse` (src/triage.ts, pure + unit-tested):
  exact normalised-text match, or the TriageGenie signature
  `We've triaged <KEY> as` (the draft can shift slightly between the
  trigger run and the panel run, e.g. the assignee line, so the
  signature catches near-duplicates too). The skip is reported in the
  panel's notes line ("first response already posted — skipped
  duplicate comment"), which the frontend already renders. If the
  comments cannot be read, it posts anyway (a duplicate is a wart, a
  missing first response is worse). Labels/priority/assignee
  behaviour unchanged. Local verification: typecheck clean, smoke
  test **84 passed / 0 failed** (77 + 7 new dedup checks in section
  [13]), manifest checks 56/56, `forge lint` clean.
- **Priority write CONFIRMED (code + live log)**: `applyTriage`
  writes priority in the same PUT as labels —
  `{ fields: { labels, priority: { name: result.priorityLabel } } }`
  with `priorityLabel` one of Jira's default names
  (Highest/High/Medium/Low/Lowest) — and the CPG-8 log shows
  `applied.priority: true`, i.e. the PUT returned OK. The browser not
  showing a priority field in the issue details is a Jira UI/screen
  matter (the CPG project's issue view does not display Priority),
  not a failed write. No code change needed.
- **NOT bugs (left as-is)**: (1) assignee stays unassigned on the
  test issue — no team member matches in trigger mode (no Teamwork
  Graph, team list empty); the panel correctly says a human must pick
  an owner. (2) The fix plan is generic/template text from the
  deterministic engine — do not try to make it issue-specific.

## ⏳ LIVE RE-VERIFICATION — NEEDED (browser, after v2.2.0 deploy)
1. Create a NEW test issue in the CPG project and wait ~1 min:
   expect labels + priority set, assignee unassigned (expected — see
   above), and ONE bot first-response comment from auto-triage.
2. Open the issue → open the TriageGenie panel → click Apply →
   **check there is exactly ONE first-response comment on the issue**
   (no duplicate) and the panel shows the "already posted — skipped
   duplicate comment" note.
3. Rovo demo: still expected absent on Jira Free — confirm and move on.
4. Delete the test issue(s) afterwards if wanted.

## ❌ LIVE VERIFICATION FAILURES (2026-11-16 16:54, browser) + FIXES
1. **Panel render error** — the issue panel showed "Error rendering app -
   encountered unknown component strong." Root cause: src/frontend/index.tsx
   used native HTML `<strong>` in 6 places; Forge UI Kit 2's reconciler
   does not support native HTML elements. Fix (commit 5560fbf): all 6
   replaced with the `@forge/react` `Strong` component (verified it is a
   real export in the installed @forge/react 12.x:
   `export declare const Strong: (props: MarkupProps) => ForgeElement`).
   No other unsupported HTML elements in the frontend (grep checked
   strong/em/b/i/u/a/br/span/div/p/h/ul/ol/li/img/code/pre/small/mark/sup/sub).
2. **Auto-triage trigger never fired (apparently)** — test issue CPG-7
   (created ~16:50) got no labels/assignee/comment after 4+ min.
   **Diagnosis: the trigger DID fire.** `forge logs -e production` shows
   one entry at 08:50:20 UTC (16:50:20 CST, exactly when CPG-7 was
   created): `{"triagegenie":"auto-triage-error","key":"CPG-7","error":
   "Forge platform failed to process runtime HTTP request - 401 -
   AUTH_TYPE_UNAVAILABLE"}`. Root cause: the trigger ran `runTriage` →
   `loadIssue` → `api.asUser().requestJira`, but a trigger invocation has
   no user context, so asUser() has no auth type available (401).
   The manifest trigger (avi:jira:created:issue) and the event payload
   shape were correct — the event reached the function with the right key.
   Fix (commit 5560fbf): the trigger path now uses `api.asApp()` for all
   Jira REST calls (load / JQL similar / assignable-team / apply), via a
   `jiraClient(asApp)` helper threaded through runTriage/loadIssue/
   similarIssuesLive/graphContextLive/liveTeam/applyTriage. Panel and
   Rovo actions keep asUser() (user context present there). Caveat:
   Teamwork Graph is asUser-only in @forge/api 8.4.0 typings
   (AsAppFetchMethods has no requestTeamworkGraph), so in app-auth mode
   the graph calls are skipped with a note and the triage is based on
   the issue text + JQL similarity; labels/priority/comment/assignee
   still apply. If the asApp assignable-user search returns 403, the
   team list degrades to empty (no assignee suggested) — watch for it
   in the re-verification logs.
3. **Rovo confirmed absent on Jira Free** (no Rovo entry anywhere) —
   expected, paid-only. Nothing removed; report as-is.

## Local verification of the fixes (commit 5560fbf)
- `npm run typecheck` ✅ clean (it caught 2 missed call sites in the
  Rovo actions — fixed before deploy).
- `npm run verify` ✅ (77 tests + 56 manifest checks, 0 failed).
- `forge lint` ✅ "No issues found."

## ⏳ Still to verify in the browser (beyond the v2.2.0 checklist above)
- The 5 Teamwork Graph queries in src/twg.ts (userTeams, teamMembers,
  assignedWork, workItemComments, workItemGoals) are only exercised on
  the panel / Rovo path (asUser) — check `forge logs -e production`
  for errors from a panel Apply, and confirm the panel's similar-issues
  / assignee data looks live rather than empty.
- Rovo demo: open Rovo and try the TriageGenie agent ("Triage this
  issue", "Who should fix this?", "Find similar past issues"). EXPECTED
  CAVEAT: Rovo is paid-only and this is a Jira Free site, so the agent
  may not appear at all — report exactly what is there; do not remove
  features without approval.

## Still needed for the Codegeist submission
- Judges' install link: generate it in the developer console (logged in as
  bnb69228@gmail.com) at
  https://developer.atlassian.com/console/myapps/822e6b7d-3afe-401b-a26a-2ed420fef57d/manage/distribution
  — there is no CLI command for this.
- Demo video (<5 min), Devpost submit by Dec 23, 2026 04:00 Beijing.

## Judges' install link (obtained 2026-11-16 17:19, "Sharing with anyone", Jira only)

https://developer.atlassian.com/console/install/822e6b7d-3afe-401b-a26a-2ed420fef57d?signature=AYABeFp2w1i8742Dg16oqcjli4oAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBIH4RMori4nvs08M1H7SrwgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDFX%2BDkZXzUpLdLDLtgIBEIA713KxxAbFuwkC%2FKDO8c2s28iWuhpn17IT0wlWYyU4cF2%2Bkx%2Bp5V1%2BKfMN%2F02uGwarBBnNtwNywIUYkAsAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgFor7BWxXNFL262ypxeG%2BCFAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMIaJBEQIzTNLzFblRAgEQgDtF8IBUPq2iqKYae7KmOSXVuq3uMxvOnsJ1rM8PYK8M4MoH1Gs7BLxGKQb27xLQ%2BkQ%2FWADOX10iqk0YxwAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAWYUBBAKzH45dwrOQSP1Mk8AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwfsbx7eIFigPH0hIECARCAO0vjk72gc%2FuPt47qW9h%2Bs6g%2F8AOm28wy3mYM4uhfcjpfeFfgfE%2Brz4VV5yU3OaxX7Em4d4jiv75MLyTqAgAAAAAMAAAQAAAAAAAAAAAAAAAAAG5kALIhly0MMr5h%2Fa1BkNj%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADI4uaixK28ISSkwr%2B3xfvQ7KCVvRdda91fR40gUqnvAhcAiZeN7VUFC%2BfTcRiA8%2ByydgMXVhTJNcp5%2BzXYCWGwG%2Ba4%3D&product=jira

## Submission progress (2026-11-16, subagent run)
- **Devpost draft:** DEVPOST-DRAFT.md (title, tagline, full description,
  testing instructions, checklist). Category: Apps for Software Teams.
  Bonus: Rovo / MCP / Teamwork Graph. Deadline Dec 23, 2026 04:00 Beijing.
- **YouTube upload pack:** YOUTUBE-UPLOAD.md (title, description, tags).
  NOTE: Codegeist rules require the demo video to be PUBLIC on YouTube
  ("Videos must be uploaded to YouTube and made public") — the earlier
  Unlisted plan conflicts; publish as Public.
- **Cover image:** demo-video/cover.png (1920x1080 title card, verified
  legible) — fallback only; prefer a real panel screenshot once available.
- **README updated:** live-verification status, install link, demo video /
  Devpost placeholders; stale "not run against live data" claims fixed.
- **Commit 5c8b155 pushed** (DEVPOST-DRAFT, YOUTUBE-UPLOAD, cover, README,
  DEMO-SCRIPT).
- **BLOCKED — real screenshots:** the video must show the REAL app. VM
  headless Chromium cannot reach the internet (ERR_TUNNEL_CONNECTION_FAILED
  via proxy, SSL error direct — re-verified 2026-11-16 three ways) and no
  Jira API token exists on the VM (Forge CLI config holds no token), so no
  screenshot route exists from the VM. Needed from a browser task (cloud
  browser, logged in as bnb69228): create a FRESH test issue in CPG (not
  CPG-7/8/9), wait ~1 min, then capture (PNG screenshots preferred; Chrome
  Print -> Save as PDF as fallback — files land in
  ~/workspace/browser_downloads/): (a) issue view with labels + the one bot
  comment, (b) TriageGenie panel open, (c) Apply clicked + green
  confirmation, (d) CPG board view. Then the video can be built (ffmpeg
  screenshot-cut, <5 min, 1920x1080, English captions, no voiceover).
- **Still needs a browser:** YouTube upload (device browser, her computer
  Chrome, Temple of Merit, Public) and Devpost submit (GitHub OAuth as
  wei1987607 — the saved Devpost password does not work).

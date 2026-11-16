# TriageGenie — Demo Video Script (< 5 min, Codegeist 2026)

Recording: real screen recording of the live Jira site https://weirongcheng9.atlassian.net
(no AI-generated UI — every frame must be the real app). Record on a computer
Chrome logged in as bnb69228@gmail.com. No voiceover needed if captions are
burned in; keep narration English (Devpost judges).

## Shots

1. **Title (5s)** — "TriageGenie — Jira triage that runs itself" + "Atlassian Codegeist 2026".
   Caption: Every new issue gets classified, prioritised and answered — automatically.
2. **The problem (20s)** — CPG project board, a fresh issue being created
   ("支付成功后订单状态不更新"). Caption: A new issue lands. Normally someone
   has to read it, label it, prioritise it, and write the first reply.
3. **Auto-triage (30s)** — Refresh the issue ~10 seconds after creation:
   labels `category:task` + `triagegenie` appear, and the bot's first-response
   comment is posted (task, priority Low, 35/100). Caption: TriageGenie already
   did it — labels, priority and a first response, in seconds.
4. **The panel (45s)** — Open the TriageGenie panel from the issue menu:
   Low · task · score 35/100 · confidence 70%, suggested labels, assignee note
   ("no team member matches — needs a human"), draft first response, fix plan,
   and the Why line. Caption: Everything is explained — nothing is a black box.
5. **Apply (30s)** — Click "Apply triage": green confirmation appears
   ("first response already posted — skipped duplicate comment"). Refresh:
   still exactly ONE first-response comment. Caption: One click applies it —
   and it never double-posts.
6. **Install (10s)** — End card: install link + GitHub repo
   https://github.com/wei1987607/triagegenie . Caption: Free. Installs on any
   Jira site in one click.

## Notes

- Use a fresh test issue for the recording (do not reuse CPG-7/8/9 — their
  triggers already ran). Wait ~1 min after creating it before refreshing.
- Do NOT demo Rovo: the Free Jira site has no Rovo entry, so the Rovo agent
  cannot be shown. The Devpost copy notes the Rovo agent is included for
  sites with Rovo; the video shows only what demonstrably works (trigger +
  panel).
- Upload to YouTube (Unlisted) on the Temple of Merit channel, same as
  FieldNotes, then paste the link into the Devpost submission.

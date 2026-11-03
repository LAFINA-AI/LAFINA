# Remaining CAPSTONE port — implementation evidence

Target: original `LAFINA-AI/LAFINA`, `LAFINA-USTP`, baseline `373be8c`.
Plan: `../plans/2026-11-03-remaining-capstone-port.md`.
Owner authorized plan then implementation, including optional Android speech engines
while keeping Whisper/Kokoro defaults. No new package has been installed.

## Stage 0 — account-safe Chat

- Reproduced the shared-session history/attachment leak with three failing tests.
- Default IDs now encode the owner. Messages validate session ownership, reads and
  deletion filter by owner, and attachment sharing rechecks account/session access.
- Legacy rows migrate transactionally only to their recorded owner's session.
  Existing historical messages do not contain trustworthy individual author-account
  metadata; pre-existing mixed content cannot be retrospectively separated by guess.
  Nothing is assigned to a newly active account or silently deleted.
- Failed session creation now throws into the existing recoverable UI path instead
  of returning a fabricated successful session ID.
- TypeScript PASS; 108 suites / 890 tests PASS with normal process exit; ESLint
  zero errors (244 warnings). Chat store line coverage 97.77%.

## Stage 1 — bounded reads

- Added stable owner/filter-bound source cursors (1–50 records) and strict date
  validation. Calendar queries restrict candidates to the visible range/recurrence
  and explicit unfinished backlog; SQL reads use batches of 50.
- Calendar no longer reloads all task history merely to draw its overdue strip.
  Full reads remain for the explicit calendar export workflow. Calendar arrays
  retain the relevant visible/backlog items; no fixed JavaScript-array size or
  measured phone-speed improvement is claimed.
- Chat initially loads the newest 50 records, with an explicit Load earlier messages
  control and stable timestamp/ID cursors. Durable messages/attachments are preserved.
- Real hook regression checks cover recurrence, navigation, visibility and calendar
  import/export; component checks exercise load-earlier behavior.
- TypeScript PASS; 110 suites / 898 tests PASS; ESLint zero errors (244 warnings).
  Calendar hook line coverage 89.05%; source-query and Chat logic exceed 80%.

## Stage 2 — factual local planner conversation

- Task/agenda questions read the owner's actual SQLite records, including completed
  and undated tasks, recurring blocks, today/tomorrow/explicit dates and this week.
  Replies are bounded, indicate more results, and show unavailable rather than model-
  invented records on read failure. Supported replies bypass cloud/model requests.
- Normalized outer polite/greeting request frames without rewriting literal notes
  or quoted titles. Existing USTP date/weekday scheduling grammar is retained.
- Added a selectable command guide. Choosing an example populates a protected draft;
  it does not Send, record or Confirm. Voice preparation uses the same read-only path.
- TypeScript PASS; 111 suites / 907 tests PASS; ESLint zero errors (244 warnings).
  Guide and conversation coverage meet their required line thresholds.

Stages 3–8 remain in progress. Physical-device acceptance is separate from host tests.

### Chat ordering follow-up

An additional failing regression demonstrated that random message-ID ordering could
put a reply before its user message when their timestamps match. Chat now uses the
local SQLite insertion order as the timestamp tie-breaker, with versioned owner-bound
cursors. No messages or timestamps are rewritten. TypeScript PASS; 111 suites /
908 tests PASS; ESLint zero errors. Earlier source pagination keeps its ID ordering.

## Stage 3 — reviewed planner mutations

- Added exact-title, owner/revision-fenced move/delete for tasks, events and blocks;
  recurring-series changes and ambiguous names require manual editing.
- Added undated/date-only tasks, actual events, and explicit named ringing-reminder
  acknowledgement/snooze. Nothing mutates before Confirm. Transactions preserve
  receipts, linked alarm generation, retries and rollback behavior.
- Quoted titles remain literal; compound/negative requests and malformed destinations
  are rejected. The fixed model JSON contract is unchanged. Read-only voice questions
  use the same local planner answers.
- TypeScript PASS; 112 suites / 919 tests PASS; ESLint zero errors (244 warnings).
  Manual undated-task access and guest-history migration follow-ups are tracked next.
Guest sign-in follow-up: a failing regression reproduced hidden transferred history. Default-session consolidation now accepts only sessions explicitly recorded as owned by the signed-in account. TypeScript PASS; 112 suites / 920 tests PASS; ESLint zero errors.

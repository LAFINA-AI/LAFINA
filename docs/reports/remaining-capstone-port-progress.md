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

Stages 1–8 remain in progress. Physical-device acceptance is separate from host tests.

# Eight CAPSTONE follow-ups — implementation evidence

Date: 2026-11-04, Asia/Manila. Target: original LAFINA-AI/LAFINA, LAFINA-USTP.
Baseline: 92ff7c4. Plan: ../plans/2026-11-04-capstone-eight-followups.md.
Owner authorized planning followed immediately by implementation. Sprint 9, offline.
No new package/model; USTP records, features, schema, speech defaults and fixed NLU
JSON remain the base. Donor provenance: capstone-eight-reference.json.

## 1 — shared native microphone ownership

Added one empty-file OS lease to Whisper capture, Android recognition and meeting
recording. Local ownership is synchronized by canonical file identity. Native worker
finally blocks release only their own lease; cancelled Whisper decode retains its
lease until actual return. The asynchronous meeting worker rechecks after preflight.

A real app_process child probe reproduced an edge case in the initial donor-style
implementation: closing a rejected local contender descriptor released the parent's
OS lock. Added the VM owner registry before opening a second descriptor. The exact
unchanged regression then passed on the existing API37 x86_64 emulator: child blocked
while parent held the lease, acquired after release; stale close did not release a
new owner. Empty-file and failure-path assertions passed with the existing 17 native
checks. No real microphone input, student DB or recording was used by the fixture.
See ADR-002 for the protocol and Android FileLock documentation.

TypeScript PASS; 122 suites / 946 tests PASS with normal exit; ESLint zero errors
(261 warnings). Standalone QA/native-test builds PASS. Updated existing emulator
app in place, without uninstall/data clear. Physical recording quality/interruption
validation remains pending. Stages 2–8 remain in progress.

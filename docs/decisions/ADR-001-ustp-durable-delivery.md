# USTP durable delivery integration

Implementation scope: approved CAPSTONE high-priority port, Sprint 9.

- Keep `com.lafina`, `lafina.sqlite`, existing reminder statuses, NLU JSON and AI models.
- Schema 20 adds a source snapshot to schema 19 local delivery jobs. SQLite triggers
  cover every reminder writer, including sync, without transmitting local generations.
- Schema 21 adds command receipts/revisions without changing native delivery columns.
  This coordinator explicitly accepts 20–21 and refuses every later schema.
- OP-SQLite and Android framework SQLite access the same file in separate processes.
  The provider/receiver/coordinator run privately in `:reminders`; no React startup there.
  Both use DELETE journal, busy timeout 5000 ms; native uses full synchronous writes.
  Native rejects missing/unrecognized schemas and never performs JS migrations.
- One serialized native coordinator owns Android dispatch. Full immutable URI identities
  contain operation, user, reminder, occurrence and generation. Notifications use tags.
- Claim/reminder/outbox commit before posting; posting receipt follows successful notify.
  Fresh-process reconciliation restores absolute alarms and missing visible notifications.
  Duplicate broadcasts and old generation actions cannot claim twice. Audible exactly-once
  delivery cannot be guaranteed across crashes.
- Preserve USTP's 45-second unanswered window and snooze tendency mapping. Fifteen
  minutes is the finite late-delivery grace. An answered call has a bounded 180-second
  recovery deadline, rather than an orphaned unlimited ring. Native timeout uses the
  saved preference, then ML/log fallback matching existing JS behavior.
- Manual/voice ACK and snooze are explicit actions, not new Chat reviews. Capture the
  delivery identity in the call session and compare it inside the mutation transaction.
- Legacy SharedPreferences entries are cleanup evidence only. After guarded schema
  setup, cancel old hash-based effects before clearing each legacy entry. Durable jobs
  remain authoritative if the upgrade is interrupted. First launch after upgrading an
  old schema is required; before that, preserve the legacy registry and report not-ready.
- Register at most 128 future alarms per pass; process bounded due/ringing batches.
  A single maintenance alarm is used only for overflow or finite recovery deadlines,
  not a perpetual background polling daemon.
- Device tests use a custom framework Instrumentation subclass with synthetic SQLite
  fixtures in cache, never a copy/replacement/clear of the real user database. No new
  runtime or test library is declared. Gradle may resolve existing Android transitive
  artifacts absent from the local cache.

Verification results belong to `docs/reports/capstone-port-progress.md`; this ADR
does not certify native behavior before those checks run.

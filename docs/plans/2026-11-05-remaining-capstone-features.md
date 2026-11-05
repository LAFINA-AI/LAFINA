# Plan: Remaining LAFINA capstone features

Baseline: branch `LAFINA-USTP` at `1bacf27` (2026-11-05). 143 Jest suites / 1100 tests, typecheck and ESLint passing.
This plan covers features the capstone paper promises that the code does not implement yet, verified by reading the repo.

## How to work through this plan (UNATTENDED MODE)

The owner is away. Nobody will answer questions. Never ask, never wait for approval, never stop for review. Make the most reasonable decision, record it, and keep going.

- Follow `CLAUDE.md`, `AGENTS.md`, and `.agents/skills/` (`implement_feature.md`, `nlu_change.md`, `add_cloud_feature.md`, `lafina_design.md`).
- **Each session does exactly one phase** (the phase number is given in the prompt). All phases run on the single branch `feat/capstone-remaining`.
- **Start of every phase:**
  1. Confirm the current branch is `feat/capstone-remaining`. If not, write the problem to the run log and stop this phase.
  2. If the working tree is dirty (a previous phase crashed), run `npm run preflight`: if it passes, commit as `wip: leftover from previous phase`; if it fails, `git stash push -u -m "leftover before phase N"`. Record which in the run log.
  3. Read `docs/reports/autonomous-run-log.md` and earlier phase reports so you know what was done and decided.
  4. Check whether earlier work already covers part of the phase (an earlier session worked on calendar class blocks, semester-aware recurrence, risk explanations, and weekly recap). Skip what exists; don't duplicate it.
- **During the phase:** plan internally, then implement. Prefer the smallest design that meets the goal. If a sub-feature is blocked (needs a real phone, missing asset, unclear requirement, would break existing behavior), skip that sub-feature, document why, and finish the rest.
- **End of every phase:**
  1. `npm run preflight` (typecheck + tests + lint) must pass with no drop below the baseline test count. Fix failures. If you cannot make it pass, revert this phase's changes to the last commit (`git stash push -u -m "phase N failed"`), and document what failed.
  2. Add Jest tests for new logic and an entry to `docs/capstone-improvements-in-ustp.md`.
  3. Write `docs/reports/phase-N-<short-name>.md` (format below).
  4. Append one dated line to `docs/reports/autonomous-run-log.md`: phase, status (DONE / PARTIAL / FAILED / SKIPPED), commit hash, test count.
  5. Commit everything with message `[Capstone] phase N: <summary>`. **Never push. Never deploy. Never force-reset or delete commits.**
- **Phase report format** (written for a student reading it later, plain language first):
  - Status and one-paragraph summary of what now works
  - What changed: features, files, schema/migrations, new tests
  - Decisions made on the owner's behalf, and why
  - Skipped or incomplete items, and why
  - How to try it in the emulator (exact steps and example commands)
  - What must be checked on a real phone (marked NOT RUN)
  - Risks and suggested follow-ups
  - Preflight result (suites/tests passing)
- **Phase 9** also writes `docs/reports/SUMMARY.md`: the overall result per phase, every decision taken, what to review first, a phone test checklist, and what to say in the defense about each feature.

## Global rules

- Offline-first: every phase-1 to phase-6 feature works with no network. Cloud only extends.
- Layering: `src/storage`, `src/ai`, `src/ml`, `src/scheduler` never import from `src/ui`; UI imports through barrels.
- No hardcoded hex colors; use `useTheme()` / `useThemedStyles`.
- Schema changes go through the existing `dbInit.ts` migration pattern and must upgrade an existing database without data loss (add a migration test).
- Any data change the assistant proposes goes through the existing review-and-confirm flow.
- Any new synced table follows the existing sync entity pattern (`syncEntityTypes.ts`, `syncWorker.ts`, `backend/app/api/v1/sync.py`). Backend deployment is deferred by the owner: write and test backend code locally only, never deploy.
- Scope limits: Android only, English only, no LMS integration, no live web search.
- Avoid new npm or Gradle dependencies. If one is truly necessary, prefer a small, well-maintained, permissively licensed package, and list it with the reason in the phase report. Phase 6 may vendor llama.cpp.
- Do not touch secrets, `.env` files, signing keys, or release configuration. Do not delete user data or existing features beyond what Phase 0 decides.

---

## Phase 0 — Decisions and audit (no feature code changes)

Do not ask. Apply the defaults in **bold** and record them in `docs/reports/decisions.md` so the owner can reverse any of them later:

1. Business/team features and Gmail conflict with the stated scope ("no team features", "no email extraction"). **Hide them behind a feature flag that is off by default** / delete them / keep them and update the scope.
2. "Hey LAFINA" wake word: **hide the toggle** (always-on listening is out of scope for battery and privacy) / implement it.
3. Daily Morning Briefing toggle: **implement it** (Phase 3) / remove it.
4. Detailed AI Summaries toggle: **wire it to the length of meeting and study-note summaries** / remove it.
5. SmolLM2: **integrate llama.cpp (Phase 6) and keep the current Kotlin rule extractor as the fast path and fallback** / keep rules only and change the paper.

Also produce `docs/paper-alignment.md`: a table of every place the code differs from the paper (FastAPI vs Django REST Framework, Pinecone vs Qdrant, Gemini cloud TTS not in the paper, onboarding questions, anything else you find), with a recommendation of which side to change. Do not change the stack to match the paper.

---

## Phase 1 — Settings, onboarding, and scope cleanup

Current state: Profile toggles for 24-hour time, week start, wake word, detailed summaries, and daily briefing are `useState` only (lost on restart, not connected). Onboarding asks wake/sleep, study peak, busiest day, lead time, snooze tendency, class count, longest gap.

- Persist all kept Profile toggles in the existing preferences store and make them work (24-hour format across Calendar/Chat/call screen; week start in Month and Week views). Apply the Phase 0 decisions to the rest.
- Add the missing paper preferences to the preferences store (synced like existing preferences):
  - preferred name/address, role (Student / Faculty / Staff)
  - reminder tone (Friendly / Formal), used in call scripts
  - quiet hours (start, end)
  - call aggressiveness (Gentle / Standard / Persistent)
  - ringtone choice (LAFINA default + device ringtones)
  - semester end date
  - default commute minutes and default prep-routine minutes (used in Phase 2)
- Align onboarding to the paper's 3 domains (Persona / Scheduling / Proactivity). Keep existing useful questions (wake/sleep, study peak). Keep it short: group questions per screen; allow skipping with sensible defaults. Existing users get the new preferences with defaults and a one-time "Finish setting up LAFINA" prompt; don't force re-onboarding.
- Guardrail log: save each blocked or out-of-scope message from `guardrail.ts` to a local `guardrail_logs` table (reason, timestamp, truncated text). Local only. Add a count in QA diagnostics.
- Profile stat "Voice Uses: Not tracked": track voice command uses locally, or replace with on-time rate if Phase 5 is done.
- Feature-flag the business and Gmail features per Phase 0 (tabs, routes, onboarding entry points, sync entities). Their tests stay green.

---

## Phase 2 — Class schedule with modality, commute, and prep time

This is the owner's signature feature. Currently nothing models classes, modality, commute, or prep.

- Class entity (new table, synced): course code, title, weekdays, start/end time, room/link, **modality: face-to-face | online**, optional per-class commute override, semester end (defaults to the preference). Reuse `time_blocks` only if it fits cleanly; explain the choice.
- Ways to add classes:
  - Calendar: an "Add class" form, and a weekly class list to edit/delete.
  - Chat/voice: "add my CS 101 class, Monday and Wednesday 9 to 10:30, face to face, room 203" → review card → confirm. Add the intent to the NLU (rules now; SmolLM2 prompt too).
- Reminder timing:
  - **Face-to-face:** one "get ready" call at `start − commute − prep − buffer (5 min)`. Script: "Your CS 101 class starts at 9:00 in room 203. Start getting ready now to leave by 8:20." **No reminders during the prep routine itself.**
  - **Online:** one call at `start − lead` with the link mentioned if present.
  - First class of the day vs. back-to-back classes: if the previous class ends on campus and the next is face-to-face, skip commute and use the normal lead. If the previous class was online and the next is face-to-face, apply commute.
- Recurrence stops at the semester end date. A week before semester end, ask in chat whether to set up the next semester's classes.
- Calendar shows class blocks in Week/Month views with a face-to-face or online marker (reuse anything an earlier session built).
- Tests: timing math for both modalities, back-to-back logic, semester cutoff, DST-free Asia/Manila assumptions handled by the existing time utils, migration.

---

## Phase 3 — Call behavior: quiet hours, aggressiveness, ringtone, tone, briefing

Currently calls use the device's default ringtone, and there is no quiet hours or aggressiveness logic.

- **Quiet hours (hard guardrail)** in the scheduler, applied to every reminder kind:
  - If a trigger falls inside quiet hours, move it to the latest allowed time *before* quiet hours start.
  - If that would be unreasonably early (more than 12 hours before the due time), schedule at quiet-hours end instead, as long as that is still before the due time.
  - If neither works, deliver a silent notification instead of a call, and log it.
  - User-snoozed calls follow the same rule.
- **Aggressiveness:**
  - Gentle: one call, no auto-redial.
  - Standard: current behavior (redial per snooze preference).
  - Persistent: redial up to the max snooze count at shorter intervals, plus one pre-warning call for high-risk items once Phase 5 exists.
- **Distinct LAFINA ringtone:** generate an original ringtone programmatically (a short synthesized melody written by a script you add under `scripts/`, output as OGG or WAV), bundle it in `res/raw`, and use it by default for call delivery. Android notification channel sounds are immutable once created, so create a new channel ID and migrate. Allow switching to a device ringtone.
- **Reminder tone and preferred name** shape the call script (`ttsService` and pre-cached audio). Regenerate pre-cached audio when these preferences change.
- **Daily Morning Briefing** (if kept): an optional call or notification at a set time (default 30 min after wake time) summarizing today's classes and due tasks, generated offline from local data and spoken with Kokoro. Respects quiet hours.
- Tests: quiet hours edge cases (overnight ranges, triggers exactly at boundaries), aggressiveness redial counts, channel migration logic.

---

## Phase 4 — Outcome logging and per-category lead time

Current state: a single global lead (0–120 min) from preferences. `tasks.category` is a display category always set to `'Work'` by the assistant. Reminder outcomes are stored on `reminders` but never logged as behavior. `tasks` has no `completed_at`. The review step in `commandSession.ts` (around lines 262–264) rejects any action whose lead differs from the global preference.

- **Task type**, separate from display category: `exam | assignment | class | meeting | personal | errand | other`, on tasks and reminders. Determined at creation by the NLU (`task_type` field) with a deterministic keyword fallback; shown and editable on the review card.
- Add `tasks.completed_at`.
- **Outcome logging** to `user_behavior_logs` from `reminderActions.ts` (acknowledged, snoozed, missed) and on task completion: task type, lead used, due time, completion time, snooze count. Logging failures must never break reminder delivery.
- **Exam check-in:** after an exam's time passes, a one-tap prompt "Did you have enough time to prepare?" → Yes / Needed more / Too early. Logged as an outcome.
- **In-call correction:** on a call, "that's too early" / "remind me earlier next time" adjusts the learned value for that type.
- **Explicit intent:**
  - One-off: "remind me 1 day before my exam" → `lead_minutes` on that schedule.
  - Standing rule: "always remind me 2 days before exams", "reset my exam reminders" → review-and-confirm → `category_lead_rules` table (synced).
  - Allow up to 14 days for these paths; the global preference cap stays as is.
- **Learner** `src/ml/categoryLeadLearner.ts` (pure TS):
  - Priors (minutes): exam 2880, assignment 1440, class 15, meeting 15, personal 30, errand 30, other = global preference.
  - Blend: `(5 × prior + n × ewmaNeeded) / (5 + n)`; EWMA alpha 0.2; add √variance as margin.
  - Missed or late → increase, capped at ×1.5 per update; on time / "too early" → decrease, capped at ×0.9 per update.
  - Clamp to [global preference, per-type max].
  - User rules always win; when the learned value disagrees with a rule for 3+ outcomes, suggest a change in chat instead of overriding.
  - Persist per user and type (local table or `ml_feature_snapshots`; explain the choice).
- **Resolver** `src/ml/resolveLeadTime.ts`: explicit one-off > user rule > learned > global preference, with the global preference as the floor. Use it in `commandSession.ts` and `reminderScheduler.ts`. Update the review validation to compare against the resolved lead while keeping stale-review protection.
- **Two calls for big tasks:** exams and assignments get a prep call (resolved lead) and a due-day call (global lead). Add a reminder `kind` (`prep` | `due`) if needed.
- **Visible:** the review card shows the lead and its reason ("2 days early: your rule for exams" / "45 min early: you missed recent exam reminders"). Profile → Scheduling & Reminder Preferences gets "Lead time by type" with source (rule / learned / default), edit, and reset.

---

## Phase 5 — ML behavioral layer (EWMA, KNN, Random Forest)

Currently `src/ml/` holds only Phase 4 code; there are no `ml_predictions` or `schedule_outputs` tables.

All pure TypeScript, deterministic (seeded) for tests, run on device in the background (not on the UI thread's critical path), no new dependencies unless approved.

- **Pipeline tables:** keep `user_behavior_logs` → `ml_feature_snapshots` (exists) and add `ml_predictions` and `schedule_outputs` to match the paper's ERD.
- **EWMA habit engine:** habitual study times, actual vs. planned durations per task type, typical acknowledgment delay. Overrides onboarding defaults gradually (about 4 weeks of data).
- **KNN (Euclidean):** for vague requests ("remind me to study later", "schedule review time"), suggest a time and duration from the k most similar past tasks (features: task type, weekday, hour, duration, outcome). Suggestions appear on the review card; the user can accept or change them.
- **Random Forest:** adherence probability per upcoming reminder (features: task type, lead, hour, weekday, recent miss rate, snooze count, days to due). Small forest of CART trees trained on device from the user's own outcomes; retrain at most once a day; minimum sample threshold before predicting (fallback to priors). High risk → extra lead or a pre-warning call (respecting quiet hours and aggressiveness).
- **Visible:**
  - Task detail shows risk in plain language when a prediction exists.
  - "What LAFINA has learned" screen in Profile: habits, lead times by type, recent predictions, with reset per item and reset all.
  - Weekly recap feeds Profile stats (reuse anything already built).
- **Evaluation support:** `evaluation/` script that generates synthetic semester logs for three personas (procrastinator, consistent, early bird), runs the learners, and outputs convergence and missed-reminder comparisons vs. a fixed 15-minute baseline (CSV + chart-ready JSON).
- Tests: each algorithm on fixed datasets, cold start, threshold behavior, determinism.

---

## Phase 6 — SmolLM2 on-device NLU via llama.cpp

Currently `SmolLM2-135M-Instruct.gguf` is bundled but never loaded. `LafinaIntentExtractor` is Kotlin regex rules. Only whisper.cpp is built natively.

- Add llama.cpp as a JNI library like `whisper_jni.cc`. whisper.cpp already vendors ggml: build both against **one** ggml to avoid duplicate symbols (pin compatible versions; document the approach in the report).
- This phase is the riskiest. If the native build cannot be made to work (including `npm run android` / Gradle assemble for the debug build), revert it, keep the rule-based extractor, and write a detailed report of what was tried, the exact errors, and a recommended next step.
- Load the model once, lazily, off the UI thread; free it under memory pressure.
- Use **GBNF grammar-constrained decoding** so output is always valid NLU JSON (including new fields: `task_type`, `lead_minutes`, class and rule intents).
- Routing: deterministic rules first for confident matches (fast path, current behavior); SmolLM2 for the rest; rules again as fallback on timeout or error. Keep the existing timeout.
- Benchmark on the golden dataset and existing evaluation fixtures: intent accuracy (target ≥ 85%), task-type accuracy, latency, memory. Record emulator numbers; mark phone numbers NOT RUN until measured on a real device.
- If quality is below target, document a LoRA fine-tuning recipe (Colab, synthetic USTP commands, convert back to GGUF Q4_K_M) in `docs/`; do not train in this session.

---

## Phase 7 — Ask questions about uploaded files

Currently the chat file button only picks an output format; Flashcards and Study Notes read PDFs but allow no follow-up questions. The backend already extracts document text (`document_text.py`).

- "Files" in Chat: upload PDF/DOCX/TXT → text extracted (backend extractor when online; plain text locally) → chunked and stored locally in SQLite with an FTS index, per user.
- Ask: "what does my syllabus say about late submissions?" → local retrieval of top chunks → online: send chunks + question to the existing DeepSeek chat endpoint with an instruction to answer only from them and cite chunk/page; offline: show the matching passages.
- Manage files: list, rename, delete (deletes chunks).
- Respect entitlements/quota and account separation like the existing AI endpoints.
- Tests: chunking, retrieval ranking, deletion, account isolation.

---

## Phase 8 — LAFINA reads your notes

Currently chat can create notes but not search or read them.

- Intents: "find my note about the thesis", "what did I write about Calculus", "read my latest note". Use the existing notes search (`notesQueryStore`).
- Offline: list matching notes with snippets, tap to open; read aloud with TTS on voice requests.
- Online (optional): summarize or answer from the matched notes via DeepSeek, with the note titles cited.
- Account separation as in Chat; never send notes to the cloud without the user's request.
- Tests: intent parsing, search integration, offline replies.

---

## Phase 9 — Wrap-up

- Update `docs/capstone-improvements-in-ustp.md` and `docs/paper-alignment.md`.
- Update the Command Guide with every new command.
- Add emulator QA scenarios for classes, quiet hours, lead time, and file Q&A to `docs/emulator-qa.md`; add phone-only cases to the phone checklist as NOT RUN.
- Final `npm run preflight` and a summary of test counts vs. baseline.

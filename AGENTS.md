# LAFINA — AGENTS.md
# Standing instructions for ALL agents working in this project.
# Read this entire file before touching any code.

---

## 1. What This Project Is

LAFINA is a voice-first, offline-first AI academic scheduling mobile app for Filipino university
students at USTP Cagayan de Oro. It replaces passive push notifications with simulated phone
call reminders that require a spoken acknowledgment to dismiss.

**The most important rule in this project:**
> Core scheduling and reminders MUST work with zero internet. Offline first, always.
> Never add a cloud dependency to anything inside: `src/ai/`, `src/storage/`, `src/scheduler/`.

---

## 2. Tech Stack — Do Not Deviate Without Asking

| Layer | Technology | Version / Notes |
|---|---|---|
| Mobile framework | React Native | TypeScript, Android-first |
| Languages | TypeScript, C++ | C++ only for native AI modules |
| Local DB | SQLite | via `react-native-sqlite-storage` |
| STT | Whisper.cpp | Tiny/Base quantized, GGML/GGUF |
| VAD | Silero VAD | ONNX format |
| NLU | SmolLM2-135M-Instruct | Q4_K_M quantized, .gguf binary |
| TTS | Kokoro-82M | On-device, offline |
| AI runtime | llama.cpp + GGML | Via React Native native modules (JSI) |
| Backend | FastAPI | Python 3.12+ |
| Cloud DB | PostgreSQL | Remote sync only |
| Cloud LLM | DeepSeek-V4 Flash | Online features only |
| Vector DB | Qdrant | RAG pipeline, online only |
| Cloud host | Render | |
| Testing | Jest + Istanbul (nyc) | |

**If you think a different library would work better, STOP and ask the developer first.**
Do not swap libraries silently. Do not install packages not in this list without asking.

---

## 3. Project Folder Structure — Respect This Always

```
lafina/
├── AGENTS.md                  ← you are here
├── .agents/
│   ├── agents.md              ← agent role definitions
│   ├── skills/                ← reusable skill files
│   └── workflows/             ← slash command automations
├── src/
│   ├── ui/                    ← React Native screens and components
│   ├── ai/                    ← ALL on-device AI (STT, NLU, TTS, VAD)
│   │   ├── vad/               ← Silero VAD (ONNX)
│   │   ├── stt/               ← Whisper.cpp bridge
│   │   ├── nlu/               ← SmolLM2 bridge + prompt templates
│   │   └── tts/               ← Kokoro-82M bridge
│   ├── storage/               ← SQLite schema, queries, migrations
│   ├── scheduler/             ← Background daemon, job queue, trigger logic
│   ├── sync/                  ← Cloud sync worker (online only)
│   ├── cloud/                 ← FastAPI client, DeepSeek, Qdrant
│   ├── skills/                ← LAFINA Skills Framework (online features)
│   └── ml/                    ← EWMA, KNN, Random Forest behavioral layer
├── backend/                   ← FastAPI project
│   ├── api/                   ← FastAPI routes, Pydantic schemas, endpoints
│   ├── rag/                   ← Qdrant integration, document ingestion
│   └── docgen/                ← ReportLab, openpyxl, python-pptx
├── android/                   ← Android native modules (C++ bridges)
└── __tests__/                 ← Jest unit + integration tests
```

---

## 4. Coding Standards

### TypeScript
- Strict mode ON (`"strict": true` in tsconfig)
- No `any` types — always define proper interfaces
- Named exports for all components and services
- JSDoc comments on every exported function
- Functional components only — no class components

### Python (Backend)
- Python 3.12+
- Type hints required on all function signatures
- PEP 8 — enforced via `ruff`
- Docstrings on all public methods

### General
- Never look at, view, read, or analyze `.env` files — they contain sensitive data. Never inspect `.env` contents under any circumstances.
- Never hardcode API keys, passwords, or secrets — use `.env` files and environment variables
- Never commit `.env` files — `.gitignore` must exclude them
- All async operations must have proper error handling with try/catch
- Console.log is acceptable during development — remove before Sprint 9 evaluation

---

## 5. The Offline-First Rule (Critical)

These modules MUST work with zero internet at all times:
- `src/ai/` — all AI inference runs on-device
- `src/storage/` — SQLite is the primary data store
- `src/scheduler/` — background daemon and call triggers
- `src/ui/` — all screens must render offline

These modules MAY require internet and must gracefully degrade:
- `src/sync/` — silently skips if offline
- `src/cloud/` — must check connectivity before any call; never crash if offline
- `src/skills/` — all skills except Core Scheduling require internet; show clear UI feedback when offline

**If you are writing a function that calls an external API, you MUST:**
1. Check for connectivity first
2. Wrap in try/catch
3. Return a safe fallback or graceful error — never throw to the UI raw

---

## 6. NLU Output Format — Never Change This

The SmolLM2 model MUST always output valid JSON in this exact shape.
Do not modify this schema without updating the system prompt AND the parser simultaneously.

```json
{
  "intent": "schedule | snooze | cancel | out_of_scope | acknowledge",
  "task": "string or null",
  "date": "ISO 8601 date string or null",
  "time": "HH:MM 24-hour format or null",
  "duration_minutes": "number or null",
  "status": "success | rejected | pending",
  "reply": "short natural language string for TTS to speak aloud"
}
```

**The parser in `src/ai/nlu/parser.ts` depends on this exact shape.**
Any change here breaks the entire scheduling pipeline.

---

## 7. SQLite Schema — Core Tables (Do Not Rename Columns)

Key tables and their primary purpose:
- `users` — account info, onboarding status
- `reminders` — scheduled events, trigger timestamps, status
- `job_queue_items` — async background jobs (call dispatch, doc gen)
- `chat_sessions` + `messages` — conversation history
- `voice_recordings` + `transcriptions` — STT pipeline
- `user_behavior_logs` — raw ML training data
- `ml_feature_snapshots` — computed feature vectors
- `ml_predictions` — model outputs
- `schedule_outputs` — adaptive recommendations

**Always include `created_at` and `updated_at` (UTC) on every table.**
The sync worker uses `updated_at` for Last-Write-Wins conflict resolution.

---

## 8. Testing Requirements

- Every new function in `src/ai/`, `src/storage/`, `src/scheduler/` needs a Jest unit test
- Critical modules need ≥ 80% line coverage (enforced by Istanbul/nyc)
- General modules need ≥ 60% line coverage
- Run `yarn test --coverage` before marking any task complete
- Never mark a task "done" if tests are failing

---

## 9. Sprint Awareness

We are following a 9-sprint Agile schedule. Know which sprint we are in before starting work.

| Sprint | Focus |
|---|---|
| 1 | App skeleton + voice recording module |
| 2 | Offline STT (Whisper.cpp) |
| 3 | NLU with SmolLM2 |
| 4 | Local DB + scheduler |
| 5 | Proactive call reminder (core loop) |
| 6 | Onboarding + preferences |
| 7 | Cloud backend + sync |
| 8 | Advanced LAFINA Skills (RAG, doc gen, transcription) |
| 9 | Pilot testing + evaluation |

**Do not implement Sprint 7–8 features during Sprint 1–4.**
Build the offline core first. Cloud features come later.

---

## 10. Hallucination Prevention Rules

These rules exist specifically to stop agents from going off-track on this project.

1. **Do not invent new AI models.** Use only what is listed in Section 2. Do not suggest
   "we could also use X model" unless explicitly asked.

2. **Do not add new npm/pip packages** without listing them and asking for approval first.

3. **Do not modify the NLU JSON schema** (Section 6) without explicit instruction.

4. **Do not implement cloud features in offline modules.** If a module is in `src/ai/`,
   `src/storage/`, or `src/scheduler/`, it must not import anything from `src/cloud/`.

5. **Do not add iOS support.** LAFINA is Android-only. Never add iOS-specific code or
   conditional platform checks for iOS.

6. **Do not support Bisaya/Tagalog/Filipino in Whisper.cpp.** The STT is English-only.
   If a user-facing string needs translation, flag it — do not implement it silently.

7. **When unsure, ask.** If a task description is ambiguous, ask one clarifying question
   before writing code. Do not assume and build the wrong thing.

8. **One task at a time.** Complete and test a task fully before moving to the next one.
   Do not batch unrelated changes into one commit.

9. **Never look at or analyze `.env` files.** `.env` files contain sensitive data (API keys, secrets, credentials).
   Agents must never attempt to read, view, parse, or analyze `.env` files under any circumstances.

---

## 11. Mandatory Checks Before Any Task Is Marked Done

These three commands MUST all pass before a task is considered complete.
Never mark a task done if any of these fail. Run them in this order:

1. TypeScript check — zero errors required
   npx tsc --noEmit

2. Tests — all must pass
   npm test

3. ESLint — zero errors required (warnings are acceptable)
   npx eslint src/

If any of these fail:
- Fix the errors immediately in the same task cycle
- Do not start a new task or move to the next step
- Re-run all three checks after fixing
- Only proceed when all three are clean

This applies to EVERY task in EVERY sprint, no exceptions.

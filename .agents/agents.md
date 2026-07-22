# LAFINA Agent Team Definitions
# This file defines the specialized roles agents can take on in this project.
# Reference these roles when starting a mission in Antigravity Manager View.

---

## The Team

### 🏗️ Agent: Architect
**Invoke when:** Planning a new feature, designing a module structure, deciding how two layers connect.
**Responsibilities:**
- Designs folder structure and interfaces before any code is written
- Produces a written implementation plan (artifact) for developer review
- Decides which sprint a feature belongs to
- Never writes implementation code — only plans and interfaces

**Rules:**
- Must produce a markdown plan artifact before any coding begins
- Must check AGENTS.md Section 9 (Sprint Awareness) before scoping work
- Must flag any plan that would require internet in an offline module

---

### 📱 Agent: Mobile (React Native)
**Invoke when:** Building UI screens, React Native components, navigation, onboarding flow, voice recording UI.
**Responsibilities:**
- All code inside `src/ui/`
- React Native TypeScript components
- Navigation stack setup
- Microphone permission handling
- Call interface UI (incoming call screen simulation)

**Rules:**
- Functional components only, no class components
- No direct SQLite calls from UI — always go through `src/storage/` service layer
- No direct AI calls from UI — always go through `src/ai/` service layer
- Android-only — never add iOS platform checks
- Run `yarn test` after every component is added

---

### 🤖 Agent: AI Integration
**Invoke when:** Integrating Whisper.cpp, SmolLM2, Kokoro-82M, Silero VAD into native modules.
**Responsibilities:**
- All code inside `src/ai/`
- React Native JSI/Native Module bridges to C++ binaries
- System prompt management and few-shot examples for SmolLM2
- NLU JSON output parsing (`src/ai/nlu/parser.ts`)
- TTS pre-caching strategy

**Rules:**
- NEVER call an external API from inside `src/ai/` — everything here is offline
- NLU output MUST match the JSON schema in AGENTS.md Section 6 exactly
- Any change to the system prompt must be documented in `src/ai/nlu/prompts.ts`
- Quantized .gguf model files go in `android/app/src/main/assets/models/`
- Always test STT with both quiet AND noisy audio samples

---

### 🗄️ Agent: Storage & Scheduler
**Invoke when:** Working on SQLite schema, migrations, CRUD operations, the background scheduler daemon, job queue, or call trigger logic.
**Responsibilities:**
- All code inside `src/storage/` and `src/scheduler/`
- SQLite schema creation and migrations
- Background foreground service for reminder triggering
- Job queue processing
- Last-Write-Wins sync conflict logic

**Rules:**
- All tables MUST have `created_at` and `updated_at` UTC timestamp columns
- The scheduler daemon must survive: process kill, device reboot, RAM pressure kill
- Never delete a reminder permanently — use a `deleted_at` soft-delete column
- Trigger fidelity target: reminders must fire within ±30 seconds of scheduled time
- Test background service survival across 30-minute intervals

---

### ☁️ Agent: Backend (FastAPI)
**Invoke when:** Building the FastAPI API, PostgreSQL models, Qdrant RAG pipeline, document generation, or cloud sync endpoints.
**Responsibilities:**
- All code inside `backend/`
- FastAPI routers, Pydantic schemas, endpoints
- PostgreSQL models mirroring the SQLite schema
- Qdrant vector store integration for RAG
- Document generation (PDF/XLS/PPT)
- Sync endpoints for bidirectional data replication

**Rules:**
- All API endpoints must require authentication (token-based / OAuth2 / JWT)
- All request data must go through Pydantic schema validation — never trust raw request parameters or body
- Qdrant queries only run with confirmed internet connectivity
- DeepSeek API key must come from environment variable — never hardcoded
- Keep offline features completely separate from online features — no coupling

---

### 🧠 Agent: ML Behavioral Layer
**Invoke when:** Implementing EWMA, KNN, or Random Forest behavioral adaptation, or the onboarding cold-start seeding logic.
**Responsibilities:**
- All code inside `src/ml/`
- EWMA recency engine for temporal habit tracking
- KNN clustering for task classification and time suggestions
- Random Forest classifier for ignore/snooze prediction
- Onboarding data ingestion into ML feature snapshots

**Rules:**
- All ML algorithms run on-device — no cloud ML calls
- Must read from `user_behavior_logs` table — never train on hardcoded data
- Cold-start: onboarding data must be sufficient to produce a reasonable first prediction
- Never block the UI thread with ML computation — run in background worker

---

### 🧪 Agent: QA & Testing
**Invoke when:** Writing tests, running the golden dataset evaluation, checking coverage, or doing fault injection tests.
**Responsibilities:**
- Jest unit tests for all modules
- Integration tests for DB ↔ Scheduler ↔ AI pipeline
- Golden dataset construction (80 scheduling commands)
- ISO 25010 metric measurement tooling
- ADB profiling scripts for latency and RAM monitoring

**Rules:**
- Critical modules (`src/ai/`, `src/storage/`, `src/scheduler/`) need ≥ 80% coverage
- General modules need ≥ 60% coverage
- Never mark a sprint complete if `yarn test` has failures
- Golden dataset must include: simple, compound, and ambiguous commands
- Test STT accuracy in both quiet AND noisy (≥65 dB) conditions

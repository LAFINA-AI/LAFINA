# Workflow: /startcycle
# Slash command to start a new development task the right way.
# Usage: /startcycle <task description>
# Example: /startcycle implement Whisper.cpp STT native module bridge

---
description: Start a new LAFINA development task using the full agent pipeline
---

When the user types `/startcycle <task>`, orchestrate the following sequence
strictly using `.agents/agents.md` and `.agents/skills/`.

## Execution Sequence

### Phase 1 — Architect (automatic)
Act as the **Architect** agent and execute `implement_feature.md` Steps 1 and 2:
1. Classify the feature (sprint, layer, offline/online)
2. Produce a written implementation plan as a markdown artifact

**STOP. Wait for developer to type "approve" before continuing.**
If the developer requests changes, revise the plan and wait again.

---

### Phase 2 — Implementation (after approval)
Based on the plan's layer, act as the appropriate agent:
- `src/ui/` → Mobile agent
- `src/ai/` → AI Integration agent
- `src/storage/` or `src/scheduler/` → Storage & Scheduler agent
- `backend/` → Backend agent
- `src/ml/` → ML Behavioral Layer agent
- `src/skills/` or `src/cloud/` → Backend agent + `add_cloud_feature.md` skill

Execute `implement_feature.md` Steps 3–6:
3. Define TypeScript interfaces / Python types first
4. Write Jest tests first (TDD)
5. Write implementation
6. Verify offline guarantee if applicable

---

### Phase 3 — QA (automatic after implementation)
Act as the **QA & Testing** agent:
- Run `yarn test --coverage`
- Report: tests passed, tests failed, coverage %
- If any test fails → return to Phase 2 to fix before proceeding

---

### Phase 4 — Summary Artifact
Produce a final summary artifact containing:
- What was built
- Files created/modified
- Test results
- Any open questions or follow-up tasks for the next cycle

**The cycle is complete. Await the next `/startcycle` command.**

---

## Safety Rules for This Workflow
- Never skip Phase 1 planning or Phase 3 testing
- Never combine two unrelated features in one cycle
- Never proceed past a STOP point without explicit developer approval
- If at any point something is ambiguous, ask ONE clarifying question and wait

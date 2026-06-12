# Skill: implement_feature
# Use this skill whenever starting work on any new feature or module.
# This prevents scope creep, hallucination, and broken offline guarantees.

---

## Step 1 — Classify the Feature

Before writing a single line of code, answer these questions:

1. Which sprint does this feature belong to? (Check AGENTS.md Section 9)
2. Which layer does it live in? (ui / ai / storage / scheduler / sync / cloud / skills / ml)
3. **Is it offline or online?**
   - If it touches `src/ai/`, `src/storage/`, or `src/scheduler/` → it is OFFLINE ONLY
   - If it touches `src/cloud/` or `src/skills/` → it is ONLINE and must gracefully degrade

If the feature is not in the current sprint, STOP and tell the developer which sprint it belongs to.

---

## Step 2 — Write a Plan First (Architect Role)

Produce a short markdown plan with:
- **What** this feature does in one sentence
- **Which files** will be created or modified
- **Interfaces / types** that will be defined
- **Dependencies** (packages, other modules)
- **Test cases** that will be written

Get developer approval on the plan before writing implementation code.

---

## Step 3 — Define Types First

Create TypeScript interfaces before any logic. Example for a reminder:

```typescript
// src/storage/types.ts
export interface Reminder {
  id: string;
  userId: string;
  task: string;
  scheduledAt: string;    // ISO 8601 UTC
  triggerAt: string;      // ISO 8601 UTC
  status: 'pending' | 'triggered' | 'acknowledged' | 'snoozed' | 'cancelled';
  precastAudioPath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;  // soft delete
}
```

---

## Step 4 — Write the Test First (TDD)

Write the Jest test BEFORE the implementation. This forces you to define what success looks like.

```typescript
// __tests__/storage/reminders.test.ts
describe('ReminderService', () => {
  it('should save a reminder to SQLite', async () => { ... });
  it('should return null for a non-existent reminder', async () => { ... });
  it('should soft-delete without removing the row', async () => { ... });
});
```

---

## Step 5 — Implement

Write the implementation to make the tests pass.
Keep functions small — one responsibility per function.
Add JSDoc to every exported function.

---

## Step 6 — Verify Offline Guarantee (If Applicable)

If this feature is in an offline module, verify:
- [ ] No `fetch()` or `axios` calls anywhere in this module
- [ ] No imports from `src/cloud/` or `src/sync/`
- [ ] Works with airplane mode ON

---

## Step 7 — Run Tests

```bash
yarn test --coverage
```

Coverage must meet the threshold (≥80% for critical, ≥60% general).
Do NOT proceed if tests fail.

---

## Step 8 — Commit

Commit message format:
```
[Sprint X] feat(layer): short description

- What was added
- What was changed
- Tests: pass/fail count
```

Example:
```
[Sprint 2] feat(ai/stt): integrate Whisper.cpp native module bridge

- Added JSI bridge to whisper.cpp C++ binary
- VAD silence detection gates audio before STT call
- Tests: 14 pass, 0 fail, 82% coverage
```

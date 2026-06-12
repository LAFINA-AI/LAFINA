# Skill: nlu_change
# Use this skill for ANY change to the NLU pipeline — system prompt, JSON schema,
# few-shot examples, or model configuration. This is the highest-risk area of the codebase.

---

## Why This Skill Exists

The SmolLM2 NLU model produces JSON that feeds directly into:
1. The SQLite scheduler (sets reminder times)
2. The TTS engine (speaks the `reply` field aloud)
3. The call interaction loop (determines acknowledge/snooze/cancel)

A broken NLU output silently corrupts scheduling data or crashes the call flow.
This skill enforces a safe change process.

---

## The JSON Contract — Never Break This

```json
{
  "intent": "schedule | snooze | cancel | out_of_scope | acknowledge",
  "task": "string or null",
  "date": "ISO 8601 date string or null",
  "time": "HH:MM 24-hour format or null",
  "duration_minutes": "number or null",
  "status": "success | rejected | pending",
  "reply": "short natural language string for TTS"
}
```

**If you need to add a field:** Add it as optional with a default. Never remove or rename existing fields.

---

## Safe Change Process

### Step 1 — Update the Schema Definition
Edit `src/ai/nlu/schema.ts`. Add the new field as optional.

### Step 2 — Update the System Prompt
Edit `src/ai/nlu/prompts.ts`.
The system prompt must:
- Explicitly list every valid intent
- Show the full JSON format with an example of every field
- State "You MUST output ONLY valid JSON. No preamble, no explanation."

### Step 3 — Update the Few-Shot Examples
Add at least one example of the new behavior to the few-shot block in `prompts.ts`.
You need examples for BOTH the happy path AND the rejection path.

### Step 4 — Update the Parser
Edit `src/ai/nlu/parser.ts`.
The parser must:
- Validate every required field is present
- Return a safe fallback object if parsing fails (never throw)
- Log the raw model output before parsing (for debugging)

### Step 5 — Run the Golden Dataset
Run all 80 test commands through the updated pipeline.
Target: NIEA ≥ 85% (≥68 of 80 commands extract correct task/date/time).

```bash
yarn test:golden
```

### Step 6 — Test Edge Cases
Manually test these specific cases:
- [ ] "Remind me tomorrow" (no explicit time — should ask for clarification)
- [ ] "Call me in 5 minutes" (snooze intent during active call)
- [ ] "What is the meaning of life?" (out_of_scope — must reject, not hallucinate)
- [ ] Empty string input (parser must not crash)
- [ ] Very long input >500 chars (model must not hang)

---

## Safe Fallback Object

If parsing fails for any reason, the parser returns this — never crashes:

```typescript
const SAFE_FALLBACK: NLUOutput = {
  intent: 'out_of_scope',
  task: null,
  date: null,
  time: null,
  duration_minutes: null,
  status: 'rejected',
  reply: "Sorry, I didn't catch that. Could you repeat your schedule request?"
};
```

# Skill: add_cloud_feature
# Use this skill for ANY feature that requires internet (Sprints 7–8).
# Cloud features must never break offline functionality.

---

## The Golden Rule

> If the internet is unavailable, LAFINA must still:
> - Accept voice commands and create reminders
> - Trigger simulated phone calls
> - Deliver TTS reminders
> - Read/write SQLite data
>
> Cloud features are enhancements. They are NEVER required for the above.

---

## Connectivity Check Pattern

Every cloud call MUST follow this pattern. No exceptions.

```typescript
import NetInfo from '@react-native-community/netinfo';

async function callCloudFeature(): Promise<Result> {
  const netState = await NetInfo.fetch();

  if (!netState.isConnected) {
    // Return graceful fallback — NEVER throw to the UI
    return { success: false, reason: 'offline', data: null };
  }

  try {
    const result = await actualCloudCall();
    return { success: true, data: result };
  } catch (error) {
    console.error('[Cloud] Call failed:', error);
    return { success: false, reason: 'error', data: null };
  }
}
```

---

## LAFINA Skills Framework — Available Skills

Only implement skills for the current sprint. Do not build Sprint 8 skills in Sprint 7.

| Skill | File | Connectivity |
|---|---|---|
| Core Scheduling | `src/ai/nlu/` | ✅ Offline (SmolLM2) |
| Institutional Knowledge (RAG) | `src/skills/rag.ts` | 🌐 Online only |
| Conversational / Trivia | `src/skills/chitchat.ts` | 🌐 Online only |
| Document Generation | `src/skills/docgen.ts` | 🌐 Online only |
| Meeting Transcription | `src/skills/transcription.ts` | 🔀 Hybrid |

---

## Adding a New Skill — Checklist

- [ ] Skill file created in `src/skills/`
- [ ] Connectivity check is the FIRST line of the skill function
- [ ] Fallback behavior defined for offline state
- [ ] DeepSeek API key sourced from `process.env.DEEPSEEK_API_KEY`
- [ ] Response is validated before passing to TTS or UI
- [ ] Unit test covers both online path AND offline fallback path
- [ ] UI shows a clear "requires internet" message when skill is unavailable

---

## DeepSeek API — Usage Rules

- Model: `deepseek-v4-flash` only (do not use v4-pro without asking — costs 12x more)
- Max tokens: 1024 for scheduling queries; 4096 for RAG; 8192 for meeting summaries
- Always include the system prompt — never send a bare user message
- Log token usage during development to monitor cost
- API key: `process.env.DEEPSEEK_API_KEY` — never hardcode

---

## Sync Worker — Conflict Resolution

The sync worker uses Last-Write-Wins (LWW) based on `updated_at` UTC timestamp.

```typescript
// Sync logic pseudocode
if (localRecord.updatedAt > remoteRecord.updatedAt) {
  pushToCloud(localRecord);  // local wins
} else {
  pullFromCloud(remoteRecord);  // remote wins
}
```

- Soft-deleted records (`deleted_at` not null) must be synced as deletions, not ignored
- Sync failures must be logged and retried — never silently drop data
- Sync runs only when `netState.isConnected === true`

# System Evaluation Improvement Plan

Status: Calendar clarity and icon standardization completed; follow-up tasks pending  
Proposed sprint: Sprint 9 (pilot testing and evaluation)  
Offline requirement: All local scheduling, calendar, notes, voice, and reminder-call behavior must remain usable without internet.

## Audit Summary

| Area | Current finding | Recommended treatment |
|---|---|---|
| Calendar design | The month view has a separate retro/physical-calendar header and decorative month-cell content that do not match the week/day views. There are also two calendar component directories, which increases the risk of UI drift. | Replace the retro month presentation with the existing app theme and one consistent navigation pattern. Keep all calendar data local. |
| Icons and buttons | Lucide is already installed and used, but import, export, and layers are icon-only in the calendar. Some note actions still use emoji-prefixed labels. | Reuse Lucide; add visible text or unambiguous accessible labels and remove emoji icons. No new dependency. |
| Notes categories | Health and Learning exist in the editor, but the filter list omits them. The database accepts category strings, but there is no category-management store or UI. | First fix the missing built-in filters; implement custom category CRUD as a separate storage/UI task with a migration and tests. |
| Voice assistant | Push-to-talk can release while permission/startup is still pending, and processing reads transcript state through a render closure. The chat modal uses Android `SpeechRecognizer` with an offline preference rather than the project's Whisper.cpp pipeline. No voice-usage-limit implementation was found in this checkout. | Make the capture lifecycle race-safe, then route voice chat through the existing offline STT service in a dedicated task. Clarify the intended voice-limit policy before adding reset logic. |
| Incoming call | A high-priority call notification and full-screen intent already exist. Android 14+ full-screen access is checked, but device permission/channel state can still cause heads-up notification behavior. | Add permission recovery and lifecycle tests, and verify behavior on locked/unlocked Android test devices as a native reminder task. |
| Cross-device transfer | Local SQLite is primary. Cross-device transfer is a Sprint 7 sync feature and cannot be guaranteed offline between devices. | Preserve offline local operation; when online sync is in scope, add connectivity checks, graceful degradation, authentication, and Last-Write-Wins handling. |
| App size | The existing release APK is 640.64 MB. Bundled offline models account for about 489.53 MB, led by Kokoro at 310.45 MB and SmolLM2 at 138.10 MB. The inspected APK also contains four native ABIs and release minification is disabled. Duplicate STT/NLU/VAD model files add about 170 MB to the repository, though they are not duplicated in the inspected APK. | Rebuild with the current arm64-only configuration, measure again, then separately evaluate release shrinking and model quantization/copy behavior without removing offline capability. |

## First Task: Calendar Clarity and Icon Standardization

Implementation status: Completed on 2026-07-16 with offline behavior preserved.

### What

Make the calendar month view visually consistent with the rest of LAFINA and make calendar actions understandable without relying on icon recognition alone.

### Classification

- Sprint: Proposed Sprint 9 UI refinement
- Layer: `src/ui/`
- Connectivity: Fully offline; no network calls or cloud imports

### Files

- Modify `src/ui/screens/calendar/CalendarScreen.tsx`
- Modify `src/ui/screens/calendar/components/MonthView.tsx`
- Add focused calendar UI tests under `__tests__/ui/`

### Planned Changes

1. Use the same themed date header and chevron navigation for month, week, and day views.
2. Remove the retro year boxes, text-arrow glyphs, and physical-calendar-only styling.
3. Simplify month cells so date, today/selection state, and schedule indicators remain readable.
4. Give Import, Export, and Layers controls visible labels on layouts where space permits, plus accessibility roles, labels, and hints.
5. Continue using the existing Lucide dependency; add no packages.

### Interfaces and Dependencies

- No NLU schema, SQLite schema, scheduler interface, or public API changes.
- No new dependencies.
- Existing local calendar stores and hooks remain the only data sources.

### Tests

1. Month mode uses the shared themed header rather than the retro header.
2. Previous, Today, and Next controls remain available and accessible.
3. Import, Export, and Layers actions expose clear labels.
4. Month cells retain task/event/block indicators and day selection behavior.

### Completion Checks

Run in this order and require all to pass:

1. `npx tsc --noEmit`
2. `npm test`
3. `npx eslint src/`

Result: TypeScript and all 104 Jest tests pass. ESLint reports zero errors; existing warnings remain permitted by the project rules.

## Follow-up Tasks (One at a Time)

1. Voice capture cancellation and offline STT routing
2. Notes built-in filters, then custom category CRUD
3. Incoming-call full-screen permission and lifecycle reliability
4. APK/installed-size optimization with before/after measurements
5. Profile control audit and prototype-alignment pass
6. Online cross-device sync only when Sprint 7 scope is explicitly approved

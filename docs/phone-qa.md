# Physical Android acceptance checklist

Implementation/host checks do not certify a phone or a production release. Record
the date, device/Android version, ABI, APK SHA-256, certificate, model assets, page
size, battery state and permission state for each run. Use synthetic named items
and remove only those fixtures afterward; preserve all existing app data.

1. Update with the matching signed APK and confirm retained accounts, records,
   Chat attachments/history, preferences and schema 21. Never clear data to pass.
2. Disconnect Wi-Fi/mobile data and enable airplane mode. Cold launch without
   Metro. Open every main screen, read saved tasks/agenda, use the command guide,
   and create an untimed/date-only task, timed task, event, block and note through
   review/Confirm. Cancel review, edit its draft and retry; no earlier write occurs.
3. Move/delete a unique quoted task/event/block and complete a task. Verify linked
   reminder replacement/cancellation; reject stale reviews, same-name ambiguity,
   recurring-series mutation and compound/negative requests. Keep existing IDs.
4. Deliver a synthetic future reminder while locked and after ordinary process
   death, reboot/unlock, Doze, battery restrictions and clock/time-zone changes.
   Test notified/blocked/inexact evidence, simultaneous alarms, duplicate actions,
   unanswered timeout and max-snooze behavior. Android force-stop intentionally
   suppresses work until launch; record that separately from ordinary process death.
5. Revoke notifications/exact/full-screen access and return from Android settings.
   Inspect health and registration recovery. Do not count registration as ringing,
   or a notification post as audible delivery. Verify ownership after sign-out.
6. Test Whisper English capture, Cancel/Stop, silence, revoked mic access, background,
   real audio interruption, incoming reminder and another recording attempt. Test
   manual corrections and draft-in-Chat handoff without automatically sending it.
7. Opt into Android recognition only on a supported device with English installed.
   Verify it still works offline; missing service/language stays recoverable through
   typing. Measure actual start/end/decode time on that phone; do not reuse host times.
8. Select one installed offline English system voice explicitly. In airplane mode,
   confirm actual audible preview, correct voice, Stop, focus loss, background and
   bounded failure. Test a missing/removed voice. Restore Whisper/Kokoro after QA.
9. Review/correct/disable/expire/Forget personal event defaults. Apply only to a new
   untouched draft. Retained Save/Apply after Forget, background/account/draft change
   must fail. Existing events remain unchanged. Sign in from guest, then start a
   fresh guest; no old facts or engine choices appear in the fresh guest account.
10. Switch two accounts and check Chat, attachments, pages, agenda and statistics.
    Voice uses shows Not tracked; note flags or text containing “voice” are not proof.
11. Inspect vendor 16 KiB native-library alignment and test on required page sizes.
    The existing ONNX Runtime warning is unresolved; do not claim broad compatibility.
12. Record crashes, audio quality, cold/warm latency, memory/battery and exact alarm
    evidence. Verify no synthetic alarm, task or preference change remains afterward.

Commands: `npm run check:architecture`, `npm run benchmark:planner`, and the ordered
TypeScript/tests/ESLint gates in AGENTS.md. Benchmark JSON is synthetic host evidence,
not physical-phone performance. Production signing/distribution is a separate action.

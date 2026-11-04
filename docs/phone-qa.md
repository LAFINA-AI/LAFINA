# Physical Android acceptance checklist

## Recording a physical run

Copy [the result template](templates/phone-acceptance-v1.json) to a new report name;
never overwrite an earlier run. Every case starts as NOT RUN. PASS requires actual
observation, FAIL requires an observed failure, and BLOCKED identifies a prerequisite.
Record UTC timestamps, the exact APK SHA-256 and public signer fingerprint. Use an
anonymous device tier/vendor/model (no serial, IMEI, account address or student data).
Do not commit audio, screen images containing real records, or private log dumps.

Use a unique `LAFINA-QA-<run>-<case>` title for each synthetic record. Record created
IDs privately during the run, then remove only the exact fixtures through normal
reviewed UI actions. Never clean by a partial title match or clear app data. Record
original settings before changing them and restore them explicitly afterward.
An interrupted run retains NOT RUN/BLOCKED cases and an unconfirmed cleanup result.
The template is preparation, not a completed phone evaluation.

| Case ID | Synthetic scenario and observation required |
| --- | --- |
| PH01 | Matching-signature ARM64 update retains existing records and preferences. |
| PH02 | Airplane-mode cold launch; create/cancel/confirm an item, then exact cleanup. |
| PH03 | Locked reminder rings; record scheduled/observed UTC and presentation/access state. |
| PH04 | Reminder survives ordinary process death and reboot/unlock; distinguish force-stop. |
| PH05 | Doze/battery restrictions; record actual delivery and missed/delayed alarms. |
| PH06 | Notification/exact/full-screen permission revoked and restored; health recovery. |
| PH07 | Whisper, optional Android recognition and meeting capture contend safely; Stop works. |
| PH08 | English recognition works offline; silence/noise and missing-language recovery. |
| PH09 | Kokoro and explicit optional English system voice are audible; Preview/Stop, speed/pitch. |
| PH10 | Incoming audio interruption/background/account switch retires owned speech work. |
| PH11 | Overnight/timezone reminder, stale Note edits and two-account isolation. |
| PH12 | Cold/warm latency, peak memory and battery measured on the named device tier. |
| PH13 | QA screen: 14/14 isolated SQLite checks and fixture removal after reopen. |
| PH14 | Per-library ELF audit and actual device page-size compatibility; record failures. |

Report speech word-error rate only from a fixed synthetic/consented reference set
with actual hypotheses. Callback timings are separate from first audible sound.
Do not convert a missing measurement into zero or mark a test PASS from a build.

Implementation/host checks do not certify a phone or a production release. Record
the date, device/Android version, ABI, APK SHA-256, certificate, model assets, page
size, battery state and permission state for each run. Use synthetic named items
and remove only those fixtures afterward; preserve all existing app data.

1. Update with the matching signed APK and confirm retained accounts, records,
   Chat attachments/history, preferences and schema 23. Never clear data to pass.
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


## CAPSTONE eight-follow-up matrix (2026-11-04)

Record device/vendor, Android version, ABI/page size, permission state and exact
QA artifact/certificate. A physical row needs physical evidence. Keep API31/32,
API33+ with installed English, missing English and no-recognition-service devices
separate. Emulator policy checks do not establish microphone or speaker quality.

| Case | Current host / emulator evidence | Physical phone status |
| --- | --- | --- |
| Whisper / Android / meeting competing microphone owners | OS lease across real processes and native checks | NOT RUN: actual microphone interruption |
| Stop during recognition preparation, revoked permission, background | Native guards and JS lifetime regressions | NOT RUN: vendor capture paths |
| Installed English vs pending/supported-only and unsupported query | Native policy and frozen speech contracts | NOT RUN: installed-language behavior |
| Missing provider, removed voice, changed system default | Inventory/selection guards and recovery tests | NOT RUN: binding and actual audibility |
| Speed/pitch 0.5, 1.0, 2.0, Preview/Stop and focus loss | Bounds/options/cancellation tests | NOT RUN: audible output and real calls |
| Busy return, close, sign-out during preview | Bounded recheck, stale handlers and timer tests | NOT RUN: real focus/account interaction |
| Notes paging, rich-text phrases, literal %/_ | 5,020-row synthetic SQLite benchmark/corpus | NOT RUN: phone frame time and memory |
| Stale Note save/delete, synced edits, full/partial drag ordering | SQL and UI regressions | NOT RUN: two-device timing |
| Overnight/multi-day event, timezone changes, linked alarm | UTC/span/layout/linked-source tests | NOT RUN: locked alarm across zone changes |
| DST gap/fold, recurrence span, legacy sync and ICS | Resolver/UI/backend contract/import tests | NOT RUN: travel/series flow |
| Native timing diagnostics | Redacted process-local callback intervals | NOT RUN: WER/NIEA, first audibility and quality |
| QA-only isolated SQL screen | Final QA diagnostics stage | NOT RUN: physical QA screen |
| Vendor ONNX Runtime 16 KiB alignment | Existing warning remains | UNRESOLVED: vendor binary compatibility |

Native request-to-ready/start/done intervals are callbacks, not acoustic measures.
Null means no observation in this process; do not substitute zero. Host performance
is not phone latency. No diagnostics here automatically capture/export recordings.

Runners: `npm run test:golden`, `npm run benchmark:intents`, `npm run benchmark:notes`,
`npm run benchmark:speech`. Benchmark outputs refuse overwrite; rerun with
`-- --output docs/reports/new-name.json`. Frozen hashes live in
`evaluation/fixture-manifest-v1.json`. Reports record the Node version, real UTC run
time captured before simulated command clocks, fixture/source hashes and limits.

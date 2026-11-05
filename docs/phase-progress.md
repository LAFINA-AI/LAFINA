# LAFINA feature phases: progress log

Work is uncommitted on branch `LAFINA-USTP`. Each section records what changed, the checks that were actually run, and what was not verified.

## Phase 1: UI fixes

### What changed

- **Inbox:** the undated-task sheet is now a collapsible tray above the week strip. It is hidden when empty.
- **Week strip:** all seven days fit with no sideways scrolling, and the strip follows the Monday setting.
- **Overdue chips:** long titles wrap to two lines. Tapping a chip opens Reschedule, Mark done and Call me about it. Recurring occurrences get Edit series and Call me about it.
- **Current-time line:** today's view opens scrolled to the current time.
- **Classes:** the + menu has a Class option, stored as a weekly `time_blocks` row with category `Class`.
- **Notes:** pull-to-refresh works on the list, grid and empty state. Notes with no title show their first line.
- **Profile:** the Voice Commands card is replaced by On-Time Rate. QA diagnostics sit behind developer mode (7 taps on App Version, QA builds only).
- **Chat:** four starter chips. Write chips still stop at Review.

### Test results

| Check | Result |
|---|---|
| `npm run preflight` | Passed: 152 suites, 1,167 tests, 0 type errors, 0 lint errors, 285 lint warnings |
| `npm run check:architecture` | Passed: no violations, no cycles |
| `python -m pytest scripts/tests/test_emulator_qa.py -q` | 17 passed |
| `qa:emulator`, full scenario, run `p1-final-20261105a` | **Blocked** after 8 checks: `adb-unavailable-or-timeout` |
| `qa:emulator`, full scenario, run `p1-final-20261105b` | Passed: 12 checks, cleanup confirmed |

The blocked run was an intermittent adb timeout. The same APK passed on the next attempt with no code change. Both reports are kept in `docs/reports/`.

### Verified on the emulator

All in throwaway Android user 10 with synthetic data, using the QA APK:

- Seven-day strip including Saturday, and the current-time line
- Inbox collapse and expand, and the corrected label "Inbox, 1 task without a date"
- Overdue sheet: Reschedule moved a task and the chip left, Mark done raised Tasks Done, Call me rang
- A long overdue title wraps to two lines
- Adding a weekly class from the + menu, seeing it the next week, and opening it as "Edit Class"
- Pull-to-refresh spinner on a populated list and on an empty filter
- A note with no title shows its first line
- On-Time Rate showing "No data", then 0% after a finished reminder that had been auto-snoozed
- Developer mode on, QA diagnostics opening, then off and hidden
- Chat chips, with a write chip stopping at Review and Confirm saving

User 10 was then removed and the debug build restored on user 0. The app opens there with the account's own data.

### The call investigation

- **The QAcall reminder fired.** It rang at about 21:27:15 and again about 5 minutes later after an auto-snooze. Polling missed it because `uiautomator dump` and `mCurrentFocus` do not see the call window. `screencap` does.
- **The earlier call screen closed because of the 45-second no-answer timeout**, not because the screen locked. The lock was a separate short screen timeout in user 10.
- **Unanswered calls are not acknowledged.** They auto-snooze until the policy limit, then become missed.
- **One acknowledged reminder is on your account (user 0):** `rem_mw2lk39o` on "my meeting google dev", acknowledged at 20:57:47 emulator time. It probably came from someone using the emulator at that point. It changed no task or block but counts toward that account's on-time rate.

### Not verified

- Nothing was run on a physical phone.
- The microphone path during a call. The permission prompt was declined and the call was acknowledged by button.

### Deviations

- Classes are added through a manual Class option, because onboarding does not collect a class schedule.
- Reschedule uses its own date and time pickers, because the task editor cannot move a due date.
- Turning developer mode on shows no confirmation alert.
- The QA runner now taps App Version 7 times before looking for QA diagnostics.

### Existing problems found, not fixed

- Saving a task with a past due time queues a call about a second later (`useScheduleItemModal.ts:133-134`).
- The "Task acknowledged" voice line failed to play on the emulator after a slow Kokoro cache miss (about 14 s). The acknowledgement is saved before the speech starts.
- In the day view, the checkbox and editor do nothing for occurrences of recurring tasks and events.
- The Wake Word, Detailed AI Summaries and Daily Briefing toggles are not saved.
- `src/ui/components/calendar/` holds dead copies of the calendar views.
- `npm run android` fails in this shell unless `NoDefaultCurrentDirectoryInExePath` is unset, and stops at a prompt if Metro is already running. Use `npx react-native run-android --no-packager`.

## Phase 2: Make the thesis visible

### What changed

- Schema v24 adds `ml_predictions`, triggers that log reminder outcomes and task completion to `user_behavior_logs`, and one index. Native version gates now accept 20 to 24, and `versionCode` is 10.
- Call log: Profile > Call log lists outcomes and spoken replies. Logs stay on the device and do not use the sync queue. Privacy text, Clear All Data and guest migration cover them.
- "Call me back" works as a button and a spoken reply. It snoozes for 15 minutes and shares the snooze limit.
- `src/ml` holds pure TypeScript EWMA and a seeded Random Forest. Predictions need 30 samples with at least 5 of each outcome.
- Risk banner in the task editor: "High risk of missing this. Call 30 min earlier?" It opens Review, and nothing changes without Confirm.
- Weekly recap on Profile. It covers the last 7 days.
- Sample data comes only from `demoSeed.ts`, is labelled, and appears only for the new demo student account (`demo.student@lafina.ph`).

### Test results

Run together with Phase 3; see that section.

### Verified on the emulator

In a throwaway user, on a QA APK built before the demo student change: the app opens on v24; a real alarm rang on v24; the answered call shows three buttons; Call back moved the alarm 15 minutes out; the call log shows the result; the recap and privacy text appear; Clear All Data empties the log.

### Not verified

- The risk banner and its Confirm flow on a device. Jest only. It needs the demo student data, which the installed APK does not have.
- Signing in as the demo student on a device.
- Spoken replies captured through the microphone (permission was denied in the test). Jest only.
- `qa:emulator` on v24, because it needs a clean final build.
- A physical phone.

### Incidents and deviations

- **My error, on your real account:** at 22:17 on 2026-11-04 the debug app was open against Metro while I edited code, and hot reload applied v24 to the database of Android user 0. A copy, since deleted, showed integrity ok and your 5 tasks, 1 note and 3 reminders intact, with no demo rows on your account. The same reload left 45 labelled demo rows on the Alice demo account in that database; they were not removed.
- **Builds stopped:** the QA rebuild and the old `npm run android` shell were stopped by the system because memory was critically low, and I was told not to restart them unless you ask. So nothing after that point has run on a device.
- The newest file at `android/app/build/outputs/apk/qa/app-x86_64-qa.apk` came from the stopped build. Do not install it.
- The recap has no task history from before v24, because those events were not logged.

## Phase 3: Smarter scheduling

### What changed

- New `find_time` intent, read by fixed rules (`src/ai/nlu/findTime.ts`). The prompt schema and few-shot example also changed, but llama.cpp is not running, so that part has no effect at runtime.
- Free slots (`src/utils/freeSlots.ts`) avoid classes, tasks, events, blocks and quiet hours, and prefer habitual hours once 5 events exist. They are offered on different days where possible.
- `FreeTimeChoicesPanel` shows up to 3 times in Chat and Voice. A pick opens the normal Review, and only Confirm saves. A pick is rechecked, and refused if the time was taken in the meantime. Choices expire after 5 minutes.
- Overlap warnings (`src/utils/conflicts.ts`, `src/scheduler/availability.ts`) appear in Review for new and moved items, in the task, event and block editors ("Go back" / "Save anyway"), and on an overdue reschedule ("Go back" / "Move anyway").
- "When can I ..." counts as a request only with a length or the word "fit", so handbook questions such as "When can I drop a subject?" still go to Chat.

### Test results

Run on 2026-11-05 as separate commands, with Jest at `--maxWorkers=2` because memory was short (this is the same three checks as `npm run preflight`):

- `tsc --noEmit`: clean.
- Jest: 158 suites, 1,298 tests passed.
- ESLint: 0 errors, 299 warnings.
- `check:architecture`: no violations or cycles, 287 files (run before four test files were edited).
- The Python QA script did not change.

Four existing tests changed because behaviour changed on purpose: the prompt schema string, the guide examples (a find-time example offers choices first), two block tests (moved off a class they now overlap) and one overnight event test (it now accepts the quiet-hours warning).

### Not verified

Nothing in this phase has run on a device, because the build was stopped (see Phase 2). This covers the choices panel, the warning text in Review and the editor alerts. Jest only.

### Deviations

- A recurring item is checked for its first occurrence only.
- A task has no duration, so a new one is checked at its start moment. An existing timed task holds 30 minutes.
- Conflict checks never block a save if the read fails.

## Phase 4: Connect existing modules

### What changed

- **Notes to reminders:** `src/utils/deadlineExtractor.ts` finds stated deadlines ("quiz next Friday") with fixed rules. `DeadlineSuggestions` offers them after an AI-transcribed note is saved in Notes, Chat or Voice, and through a "Suggest reminders" link in meeting notes. Each one opens the normal Review, and only Confirm saves. A date with no stated time uses the wake time, and Review shows it.
- **Academic calendar overlay:** `src/utils/academicCalendar.ts` holds the format, validation and the table. It was empty until the owner supplied AY 2025-2026 (see "Academic calendar data" below). The Day view chip and the My Calendars row are built.
- **Semester-aware recurrence:** `linkedReminders` now keeps each reminder of a series on its own date. `recurringReminders.ts` creates a rolling 14 days of occurrences when the scheduler starts. Setting an Until date on a class saves it as the semester end, applies it to every class, and retires later reminders.
- **Sync status:** `SyncStatusLine` reads "Saved on this device", with the waiting count, or "Synced 5m ago" once a sync has happened. Tapping it explains the status.
- **Undo:** a "Saved" snackbar with Undo shows for 5 seconds after reviewed commands and the overdue actions Mark done, Reschedule and Call me about it. It refuses if the item changed again.
- **QA script:** a saved change no longer shows an OK alert, so the script waits for the reply in Chat. One Python test was added.

### Test results

Final checks on 2026-11-05, on the finished code. These ran as separate commands, with Jest at `--maxWorkers=2` because memory was short, so `npm run preflight` itself did not run as one command:

- `tsc --noEmit`: clean.
- Jest: 161 suites, 1,356 tests passed.
- ESLint: 0 errors, 302 warnings.
- `check:architecture`: no violations or cycles, 296 files.
- Python QA tests: 18 passed.
- `qa:emulator`: **not run on this code**. The last pass was Phase 1 (`docs/reports/emulator-p1-final-b-2026-11-05.json`).

### Not verified

Nothing in this phase has run on a device, because the build was stopped (see Phase 2). This covers the snackbar position, the suggestion panel, the sync line at phone width, the class hint, and alarms for rolling reminders. The updated QA script has only run against its unit tests, not on an emulator.

### Deviations and limits

- **Sync line position:** it sits in a thin row directly under the header, not beside the badge in the header. I could not check the fit on a device, and the header already holds a toggle and two icons.
- **Inbox has no Undo:** the Inbox tray's only action is opening the editor, so there is nothing direct to undo. Manual editor saves have no Undo, per decision F.
- **Finished calls have no Undo:** acknowledge and snooze from a call cannot be undone, because the call has already ended. A requested call can be undone only until it starts ringing.
- **Undo and sync:** an undo records a normal sync change. If a sync ran inside the window, the server would see the change and then its reversal. Backend work is deferred, so this has not been tried against a server.
- **Restored reminders are new rows:** undoing a delete or completion creates a new reminder when its time is still ahead, instead of reviving the old one.
- **Rolling reminders need the app to open:** they are created only when the scheduler starts, so a phone that does not open the app for 14 days runs out of calls.
- **Classes now call by default:** a repeating class gets a call before each session, as the brief's class reminders need. The form says so, but there is no per-class off switch yet.
- **Month view has no academic marker:** only the Day and Week views' day list shows it, matching how holidays work today.
- **A recurring event with its own time zone** uses local wall time for each occurrence.
- **Deadline panel covers Undo:** when a saved note has a deadline, the panel opens over the snackbar, so Undo for that note can't be reached while the panel is open.

## Academic calendar data (added after the Phase 4 report)

The owner supplied the USTP calendar for AY 2025-2026, and `ACADEMIC_CALENDAR` now has 52 entries.

- **It has already ended:** the last entry is 2026-07-25. It is kept for looking back, and AY 2026-2027 below covers current dates.
- **Left out as already shown:** national holidays the built-in Philippine layer covers. Only 2025-11-02 was missing from that layer, so it is the one holiday entry.
- **Left out as not for students:** faculty service dates, teachers' leave and the faculty Christmas break, grade deadlines, admission applications, awards, the year-end assembly, and commemorations other than Charter Day.
- **Not entered because they look wrong in the source:** an undergraduate "Final Examination Period" on March 26, 2026 (finals are May 18-23), and "Start of Classes for AY 2025-2026" on August 10, 2026 (after that year ended). No dates were corrected or guessed.
- **Not verified:** chips and the My Calendars row on a device. Jest only.

### AY 2026-2027

The owner first supplied a text transcription, then the approved PDF (`05132026-USTP SYSTEM - ACADEMIC CALENDARS AY 2026-2027 CN 26-O-4428.pdf`, BOR Res. No. 67, s. 2026). **All AY 2026-2027 entries were replaced from the PDF's scanned pages**, read by eye, with no OCR. The table reaches 2027-08-09.

- **Why the transcription was replaced:** it dropped rows and merged the undergraduate and graduate sections. It presented the October 10 midterm, the November 23-28 finals and the December 19 final as if for all students. In the PDF, October 10 and December 19 are graduate rows. Undergraduate midterms are October 5-10, pre-finals November 9-14, and non-graduating finals December 9-19. Undergraduate graduation applications close October 31, not December 19.
- **Campus:** page 1 lists Cagayan de Oro among the campuses it applies to, so this was checked in the original.
- **Holidays:** the built-in layer already covers every holiday listed, so none were added. Its Eid'l Fitr date for 2027 is an estimate, and it matches this calendar's March 9.
- **Left out:** ASEAN Day, Praise Award, World Teacher's Day, World Engineering Day, the Rotoras anniversaries, the year-end assembly, faculty evaluation, review and leave rows, CHED list submissions, admission applications, and grade deadlines.
- **Conflict in the original:** the midyear rows and calendar shading start classes on June 5, 2027, but the summary table says June 9. The entry uses June 5 and its chip says to confirm. The term's end, July 22, is not affected.
- **AY 2025-2026 still comes from a transcription:** its PDF has not been supplied, so it may have the same kinds of errors. The March 26, 2026 row stays out. This PDF confirms only that August 10, 2026 is the start of AY 2026-2027.
- **Bug fixed because this data made it reachable:** a class added for next term got this term's end, which is before it starts, and saving a class end was applied to every class. `semesterStore` now uses the term of the date being scheduled through `academicTermOf`, so other terms keep their own end and a class never ends before it starts.
- **Behaviour change:** a new class added before December 19, 2026 now has that date filled in as its Until date. The student can change it.
- **Limit:** only one student-set end date is stored, so saving one for next term sends this term's new classes back to the calendar's date.
- **Not verified:** the class form and these chips on a device. Jest only.

### Decisions left to the developer

The owner asked for the recommended options to be applied.

- **Graduation application windows:** all 12, in both years, now show a chip on their first and last days only, marked "(first day)" or "(last day)". They no longer appear on every day between, so November 5, 2026 has no chips.
- **No undergraduate or graduate filter:** every student still sees both sets of rows. The labels say who each row is for, and a filter would be a new setting.
- **Midyear start:** stays June 5, 2027, with the chip's prompt to confirm. A college's answer would settle it.
- **AY 2025-2026:** stays as transcribed until its PDF is supplied.

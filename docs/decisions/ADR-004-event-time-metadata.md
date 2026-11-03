# ADR-004: explicit event end dates and named-zone UTC instants

Date: 2026-11-04. Status: accepted within the authorized CAPSTONE follow-ups.

Schema 23 adds nullable end_date, time_zone, start_at, end_at, start_fold and
end_fold columns to USTP events. Existing date/start_time/end_time columns, IDs,
created_at/updated_at, outbox and linked reminder identities remain authoritative.
Legacy rows keep null metadata and their original floating wall-time meaning.
No bulk reinterpretation or donor database replacement occurs.

New Calendar events choose an explicit end date and IANA timezone (device timezone
initially), with separate earlier/later choices for repeated start/end wall times.
Conversion samples neighboring offsets and requires exact round trips: gaps fail,
folds require a choice, positive ranges are bounded to 31 days. Captured UTC start
and end instants are validated against the wall values. Reminder creation/refresh
uses saved start_at, so a device timezone change does not move the event alarm.

Calendar timelines show saved wall time with a timezone label, rather than silently
converting the event's day to the current device zone. Window queries include spans
that begin before the window. Recurrence preserves the calendar-day span in the
saved timezone; impossible/ambiguous occurrences are omitted with visible repair
feedback rather than rolled to another time. Existing recurrence/reminder behavior
is preserved; this change does not add an independent recurring alarm generator.

Reviewed commands support overnight event creation/moves with dated summaries and
private metadata; the model JSON/prompt and English grammar remain unchanged.
Moves interpret the new destination in the displayed current device timezone,
retain elapsed event duration, and move the existing linked reminder. A review is
already invalidated if its device timezone/offset changes before confirmation.

ICS exports TZID/end dates/fold choices and restores explicit UTC metadata on event
import. Floating overnight imports use the current device timezone; legacy
same-day floating imports stay floating. Invalid datetime input is rejected, never
changed to today. Foreign unlabelled VEVENT-to-time-block behavior stays unchanged.

Sync carries optional metadata in full event payloads. Legacy records omit new
wire keys. A title-only pull from an older client preserves metadata if all wall
times match; changed old-client times clear metadata and retain floating semantics.
New metadata is validated before SQL writes. The backend's pure EventPayload
contract accepts old payloads and validates complete positive UTC ranges. Deploy
this backend contract before syncing metadata-enabled events to an older server;
its extra-field rejection will otherwise leave local changes pending, not lose them.
This task does not deploy cloud services. Local scheduling stays fully offline.

Native delivery explicitly accepts reviewed schemas 20–23 and validates metadata
in source snapshots. Install its compatible reader and bundled migration together
using the standalone QA APK before schema 23 runs. Unknown future versions remain
refused. New columns are added transactionally and migration failures do not advance
user_version. QA instrumentation uses an isolated fixture, never student data.

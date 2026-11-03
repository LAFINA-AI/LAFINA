# ADR-002 — shared live microphone ownership

Date: 2026-11-04. Sprint 9. Accepted within the owner's eight-follow-up request.

USTP has three live recording entry points: Whisper command capture, optional Android
recognition and the meeting recorder service. JavaScript capture ownership alone does
not serialize all native modules/processes. Preserve these USTP entry points and use
the reviewed CAPSTONE empty-file OS lock pattern behind them.

`LafinaMicrophoneLease` locks the same empty file in the app's no-backup directory.
All live recorders must acquire it before touching the microphone. It contains no
account, transcript or audio. A failed acquisition starts no competing recording.
Kernel process teardown releases the lock; the file must not be removed/replaced
while any owner can be alive. Closing an old lease cannot release a newer owner.

Whisper retains its lease until its native worker finally returns, including a
cancelled non-cooperative decode. Android recognition releases after cancel/destroy.
The meeting API preflights for immediate busy feedback; its asynchronous worker must
independently acquire the lease, closing the race before opening AudioRecord. If
another recorder wins that race, the meeting follows its existing recorder-failure
cleanup. A service-start acceptance does not prove audio recording began.

This lock does not arbitrate microphone use by other installed apps. Android audio
policy, permissions, focus handling and lifecycle cancellation remain required. A
stuck native worker may require app restart; releasing its lease early is unsafe.
File transcription/playback do not use the live microphone and need no lease.

Verification: isolated same-process competition/release/stale-close checks and an
`app_process` child probe for actual OS cross-process exclusion/release. The probe
uses a synthetic cache lock and installed APK classpaths, never the live lock or
student database. Recording quality and device interruptions need physical QA.

The first real cross-process test failed after an overlapping same-process attempt:
opening/closing its second descriptor released the process's original OS lock. The
helper also serializes a canonical-path owner registry inside the VM and rejects
local contenders before opening another descriptor. Android documents this platform
behavior: https://developer.android.com/reference/java/nio/channels/FileLock .
The child-process regression is required; a VM-only overlap check would miss it.

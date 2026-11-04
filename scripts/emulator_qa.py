"""Explicit, bounded USTP emulator scenarios; never clears data or changes OS settings."""

import argparse
import hashlib
import json
import re
import shlex
import subprocess
import time
import xml.etree.ElementTree as ET
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

PACKAGE = "com.lafina"
REFUSAL = "Choose one exact saved title. No match or duplicate titles require manual Calendar controls."
TABS = ("Calendar tab", "Notes tab", "Chat tab", "Profile tab")
# Extract only one public state flag on-device, never transfer IME history/debug data.
KEYBOARD_VISIBILITY_QUERY = (
    "dumpsys input_method | grep -Eo -m 1 'mInputShown=(true|false)' || true"
)


class QaFailure(Exception):
    """A fixed, privacy-safe failure code, never device text or a raw exception."""

    def __init__(self, code: str, blocked: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.blocked = blocked


class AdbPort(Protocol):
    """The narrow transport needed by the runner and synthetic unit tests."""

    def run(self, *args: str, timeout: int = 15) -> str:
        """Run one bounded explicit operation."""
        ...


def fixture_command(action: str, run_id: str, kind: str) -> str:
    """Construct only one of this run's two exact synthetic task commands."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,47}", run_id) or kind not in (
        "main",
        "cancel",
    ):
        raise QaFailure("invalid-fixture-namespace")
    title = f"LAFINA-QA-{run_id}-{kind}"
    if action == "create":
        return f'Add task "{title}"'
    if action == "delete":
        return f'Delete task "{title}"'
    raise QaFailure("unsupported-fixture-action")


class Adb:
    """ADB subprocess transport restricted to an explicitly selected emulator."""

    def __init__(self, executable: str, serial: str) -> None:
        if not re.fullmatch(r"emulator-[0-9]{4,5}", serial):
            raise QaFailure("select-explicit-emulator", True)
        self.executable, self.serial = executable, serial

    def run(self, *args: str, timeout: int = 15) -> str:
        """Bound runtime/output; never expose raw device stdout on failure."""
        try:
            result = subprocess.run(
                [self.executable, "-s", self.serial, *args],
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise QaFailure("adb-unavailable-or-timeout", True) from error
        if result.returncode != 0 or len(result.stdout) > 1048576:
            raise QaFailure("adb-operation-failed")
        return result.stdout.decode("utf-8", errors="replace")


class UiSnapshot:
    """An in-memory hierarchy; private text is never included in reports."""

    def __init__(self, xml: str) -> None:
        if len(xml) > 1048576 or "<!DOCTYPE" in xml or "<!ENTITY" in xml:
            raise QaFailure("invalid-ui-hierarchy")
        try:
            self.nodes = list(ET.fromstring(xml).iter("node"))
        except ET.ParseError as error:
            raise QaFailure("invalid-ui-hierarchy") from error
        if len(self.nodes) > 10000:
            raise QaFailure("oversized-ui-hierarchy")

    def has(self, label: str) -> bool:
        """Match a known exact public control label."""
        return any(
            label in (node.get("text"), node.get("content-desc")) for node in self.nodes
        )

    def contains(self, text: str) -> bool:
        """Check a known fixed reply/owned synthetic summary without exporting it."""
        return any(text in node.get("text", "") for node in self.nodes)

    def dimensions(self) -> tuple[int, int]:
        """Determine gesture bounds from the current observed hierarchy."""
        match = (
            re.fullmatch(
                r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", self.nodes[0].get("bounds", "")
            )
            if self.nodes
            else None
        )
        if not match:
            raise QaFailure("missing-ui-bounds")
        left, top, right, bottom = map(int, match.groups())
        if left < 0 or top < 0 or right <= left or bottom <= top:
            raise QaFailure("missing-ui-bounds")
        return right, bottom

    def node_point(self, node: ET.Element) -> tuple[int, int]:
        """Reject missing, negative, empty or offscreen coordinates."""
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
        if not match:
            raise QaFailure("invalid-control-bounds")
        x1, y1, x2, y2 = map(int, match.groups())
        width, height = self.dimensions()
        if not (0 <= x1 < x2 <= width <= 10000 and 0 <= y1 < y2 <= height <= 10000):
            raise QaFailure("offscreen-control")
        return (x1 + x2) // 2, (y1 + y2) // 2

    def point(self, label: str) -> tuple[int, int]:
        """Locate one observed control; only a sheet Close may have a backdrop twin."""
        matches = [
            node
            for node in self.nodes
            if label in (node.get("text"), node.get("content-desc"))
        ]
        clickable = [node for node in matches if node.get("clickable") == "true"]
        matches = clickable or matches
        if label == "Close" and matches:
            matches.sort(key=lambda node: len(node.get("bounds", "")))
            matches = matches[-1:]
        if len(matches) != 1:
            raise QaFailure("missing-or-ambiguous-control")
        return self.node_point(matches[0])

    def editor(self) -> ET.Element:
        """Require the single Chat editor rather than guessing another input field."""
        fields = [
            node
            for node in self.nodes
            if node.get("class") == "android.widget.EditText"
        ]
        if len(fields) != 1:
            raise QaFailure("chat-editor-unavailable", True)
        return fields[0]

    def has_editor(self) -> bool:
        """Check readiness during native dialog transitions without guessing."""
        return (
            len(
                [
                    node
                    for node in self.nodes
                    if node.get("class") == "android.widget.EditText"
                ]
            )
            == 1
        )


class UiRunner:
    """Interact only through observed controls and reviewed owned test commands."""

    def __init__(self, adb: AdbPort, run_id: str) -> None:
        fixture_command("create", run_id, "main")
        self.adb, self.run_id = adb, run_id
        self.xml_path = f"/sdcard/lafina-qa-ui-{run_id}.xml"
        self.last_command: str | None = None
        self.dump_attempted = False
        self.tracked: set[str] = set()
        self.checks: list[dict[str, str]] = []

    def snapshot(self) -> UiSnapshot:
        """Capture into one owned temporary path and parse only in memory."""
        self.dump_attempted = True
        result = self.adb.run("shell", "uiautomator", "dump", self.xml_path, timeout=20)
        if "dumped to:" not in result:
            raise QaFailure("ui-dump-not-completed")
        return UiSnapshot(self.adb.run("shell", "cat", self.xml_path))

    def wait_for(
        self, predicate: Callable[[UiSnapshot], bool], seconds: int = 30
    ) -> UiSnapshot:
        """Wait for a material UI state under an overall deadline."""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            state = self.snapshot()
            if predicate(state):
                return state
            time.sleep(0.5)
        raise QaFailure("expected-ui-state-timeout")

    def tap(self, label: str, scroll: bool = False) -> None:
        """Tap a visible observed target; optional bounded upward scrolling."""
        for attempt in range(5 if scroll else 1):
            state = self.snapshot()
            try:
                x, y = state.point(label)
            except QaFailure:
                if not scroll or attempt == 4:
                    raise
                width, height = state.dimensions()
                self.adb.run(
                    "shell",
                    "input",
                    "swipe",
                    str(width // 2),
                    str(height * 3 // 4),
                    str(width // 2),
                    str(height // 3),
                    "300",
                )
                continue
            self.adb.run("shell", "input", "tap", str(x), str(y))
            return

    def record(self, name: str) -> None:
        """Append only a fixed public scenario label after observing success."""
        self.checks.append({"name": name, "status": "PASS"})
        print(json.dumps({"check": name, "status": "PASS"}), flush=True)

    def baseline(self) -> None:
        """Open the four offline screens without dismissing drafts/reviews."""
        self.adb.run("shell", "am", "start", "-n", PACKAGE + "/.MainActivity")
        initial = self.snapshot()
        if initial.has_editor():
            if initial.editor().get("text", "") not in ("", "Ask LAFINA..."):
                raise QaFailure("existing-draft-preserved", True)
            self.hide_keyboard_if_shown()
        state = self.wait_for(
            lambda value: (
                value.has("Review before saving") or all(value.has(tab) for tab in TABS)
            ),
            45,
        )
        if state.has("Review before saving"):
            raise QaFailure("existing-review-preserved", True)
        fields = [
            node.get("text", "")
            for node in state.nodes
            if node.get("class") == "android.widget.EditText"
        ]
        if any(text not in ("", "Ask LAFINA...") for text in fields):
            raise QaFailure("existing-draft-preserved", True)
        expected = {
            "Calendar tab": "Choose calendar date",
            "Notes tab": "Notes",
            "Profile tab": "PREFERENCES",
            "Chat tab": "Command guide",
        }
        for tab in TABS:
            self.tap(tab)
            self.wait_for(lambda value, label=expected[tab]: value.has(label))
            self.record("offline-" + tab.split()[0].lower())
        self.wait_for(lambda value: value.has("QA diagnostics"))
        self.record("installed-qa-controls-present")

    def diagnostics(self) -> None:
        """Run real isolated SQL twice with a close/reopen between runs."""
        self.tap("Profile tab")
        for attempt in range(2):
            self.tap("QA diagnostics", scroll=True)
            self.wait_for(lambda value: value.has("Run isolated SQLite checks"))
            self.tap("Run isolated SQLite checks")
            self.wait_for(
                lambda value: (
                    value.has("14 of 14 checks passed")
                    and value.contains("Synthetic fixture removed")
                )
            )
            self.record(f"isolated-sql-14-pass-fixture-removed-{attempt + 1}")
            self.tap("Close")
            self.wait_for(lambda value: not value.has("Run isolated SQLite checks"))
        self.record("diagnostics-close-reopen")

    def hide_keyboard_if_shown(self) -> None:
        """Use Back only when Android positively reports a visible input keyboard."""
        state = self.adb.run("shell", KEYBOARD_VISIBILITY_QUERY)
        flags = re.findall(r"\bmInputShown=(true|false)\b", state)
        if flags == ["true"]:
            self.adb.run("shell", "input", "keyevent", "KEYCODE_BACK")

    def clear_owned_draft(self) -> None:
        """Erase only the exact command this runner just placed in the Chat editor."""
        state = self.snapshot()
        editor = state.editor()
        if not self.last_command or editor.get("text", "") != self.last_command:
            raise QaFailure("existing-draft-preserved", True)
        x, y = state.node_point(editor)
        self.adb.run("shell", "input", "tap", str(x), str(y))
        self.adb.run("shell", "input", "keyevent", "KEYCODE_MOVE_END")
        self.adb.run(
            "shell", "input", "keyevent", *(["KEYCODE_DEL"] * len(self.last_command))
        )
        self.wait_for(
            lambda value: value.editor().get("text", "") in ("", "Ask LAFINA...")
        )
        self.last_command = None
        self.hide_keyboard_if_shown()

    def send_fixture(self, action: str, kind: str, expected: str) -> UiSnapshot:
        """Send one generated command only after proving the resulting input is exact."""
        state = self.snapshot()
        if state.has("Review before saving"):
            raise QaFailure("existing-review-preserved", True)
        editor = state.editor()
        current = editor.get("text", "")
        if current not in ("", "Ask LAFINA..."):
            if current != self.last_command:
                raise QaFailure("existing-draft-preserved", True)
            self.clear_owned_draft()
            state = self.snapshot()
            editor = state.editor()
        command = fixture_command(action, self.run_id, kind)
        x, y = state.node_point(editor)
        self.adb.run("shell", "input", "tap", str(x), str(y))
        self.last_command = command
        self.adb.run("shell", "input", "text", shlex.quote(command.replace(" ", "%s")))
        self.wait_for(
            lambda value: (
                value.has_editor() and value.editor().get("text", "") == command
            )
        )
        self.tap("Send message")
        if expected == "review":
            return self.wait_for(lambda value: value.has("Review before saving"))
        state = self.wait_for(
            lambda value: value.has("Review before saving") or value.has("OK")
        )
        if state.has("Review before saving"):
            if expected == "either":
                return state
            raise QaFailure("fixture-name-already-present", True)
        return self.acknowledge_result("absent", kind)

    def acknowledge_result(self, outcome: str, kind: str) -> UiSnapshot:
        """Acknowledge only the exact native alert produced by this run's command."""
        action = "delete" if outcome in ("absent", "delete") else "create"
        if outcome not in (
            "absent",
            "delete",
            "create",
        ) or self.last_command != fixture_command(action, self.run_id, kind):
            raise QaFailure("unowned-result-dialog-preserved", True)
        title = f"LAFINA-QA-{self.run_id}-{kind}"
        message = (
            REFUSAL
            if outcome == "absent"
            else "Saved the task without a reminder."
            if outcome == "create"
            else f"Deleted “{title}”."
        )
        state = self.wait_for(lambda value: value.has("OK"))
        if not state.has(message):
            raise QaFailure("unexpected-result-dialog-preserved", True)
        self.tap("OK")
        state = self.wait_for(
            lambda value: value.has("Send message") and value.has_editor()
        )
        draft = state.editor().get("text", "")
        if draft == self.last_command:
            self.clear_owned_draft()
            state = self.snapshot()
        elif draft in ("", "Ask LAFINA..."):
            self.last_command = None
        else:
            raise QaFailure("existing-draft-preserved", True)
        return state

    def confirm_owned(self, action: str, kind: str) -> None:
        """Confirm only a review whose operation and exact title belong to this run."""
        fixture_command(action, self.run_id, kind)
        state = self.snapshot()
        title = f"LAFINA-QA-{self.run_id}-{kind}"
        prefix = f"{'Create' if action == 'create' else 'Delete'} task “{title}”"
        if not state.has("Review before saving") or not any(
            node.get("text", "").startswith(prefix) for node in state.nodes
        ):
            raise QaFailure("unowned-or-wrong-review-preserved", True)
        if action == "create" and not state.contains(
            "No time or reminder will be invented."
        ):
            raise QaFailure("fixture-must-not-create-alarm")
        self.tap("Confirm command")
        self.wait_for(lambda value: not value.has("Review before saving"))
        self.acknowledge_result(action, kind)

    def roundtrip(self) -> None:
        """Exercise reviewed cancellation and exact synthetic create/delete cleanup."""
        self.tap("Chat tab")
        for kind in ("main", "cancel"):
            self.send_fixture("delete", kind, "absent")
        self.tracked.add("cancel")
        self.send_fixture("create", "cancel", "review")
        if not self.snapshot().contains(
            f"Create task “LAFINA-QA-{self.run_id}-cancel”"
        ):
            raise QaFailure("unexpected-cancel-review")
        self.tap("Cancel review")
        self.wait_for(
            lambda value: (
                not value.has("Review before saving")
                and value.editor().get("text", "") == self.last_command
            )
        )
        self.record("cancel-review-keeps-owned-draft")
        self.clear_owned_draft()
        self.send_fixture("delete", "cancel", "absent")
        self.tracked.remove("cancel")
        self.record("cancelled-task-not-found-by-exact-lookup")
        self.tracked.add("main")
        self.send_fixture("create", "main", "review")
        self.confirm_owned("create", "main")
        self.record("confirmed-untimed-task-saved")
        self.send_fixture("delete", "main", "review")
        self.confirm_owned("delete", "main")
        self.send_fixture("delete", "main", "absent")
        self.tracked.remove("main")
        self.record("exact-fixture-deleted-and-not-found")

    def cleanup(self) -> bool:
        """Attempt only tracked synthetic cleanup; preserve foreign drafts/reviews."""
        clean = True
        for kind in sorted(self.tracked):
            try:
                state = self.snapshot()
                if state.has("Review before saving"):
                    title = f"LAFINA-QA-{self.run_id}-{kind}"
                    if not any(
                        node.get("text", "").startswith(
                            (f"Create task “{title}”", f"Delete task “{title}”")
                        )
                        for node in state.nodes
                    ):
                        raise QaFailure("foreign-review-preserved", True)
                    self.tap("Cancel review")
                current = self.send_fixture("delete", kind, "either")
                if current.has("Review before saving"):
                    self.confirm_owned("delete", kind)
                    self.send_fixture("delete", kind, "absent")
                self.tracked.discard(kind)
            except QaFailure:
                clean = False
        if self.last_command:
            owned = [
                (action, kind)
                for action in ("create", "delete")
                for kind in ("main", "cancel")
                if self.last_command == fixture_command(action, self.run_id, kind)
            ]
            try:
                if len(owned) != 1:
                    raise QaFailure("unowned-draft-preserved", True)
                action, kind = owned[0]
                state = self.snapshot()
                if state.has("OK"):
                    self.acknowledge_result(
                        "absent" if state.has(REFUSAL) else action, kind
                    )
                elif state.has("Review before saving"):
                    title = f"LAFINA-QA-{self.run_id}-{kind}"
                    prefix = (
                        f"{'Create' if action == 'create' else 'Delete'} task “{title}”"
                    )
                    if not any(
                        node.get("text", "").startswith(prefix) for node in state.nodes
                    ):
                        raise QaFailure("foreign-review-preserved", True)
                    self.tap("Cancel review")
                    self.wait_for(lambda value: value.has_editor())
                    self.clear_owned_draft()
                elif (
                    state.has_editor()
                    and state.editor().get("text", "") == self.last_command
                ):
                    self.clear_owned_draft()
                elif not state.has_editor() or state.editor().get("text", "") not in (
                    "",
                    "Ask LAFINA...",
                ):
                    raise QaFailure("foreign-draft-preserved", True)
            except QaFailure:
                clean = False
        if self.dump_attempted:
            try:
                self.adb.run("shell", "rm", "-f", self.xml_path)
            except QaFailure:
                clean = False
        return clean


def installed_hash(adb: AdbPort, package: str) -> str:
    """Hash only the installed LAFINA app or its explicit instrumentation APK."""
    if package not in (PACKAGE, PACKAGE + ".test"):
        raise QaFailure("unsupported-package")
    value = adb.run("shell", "pm", "path", package).strip()
    if not re.fullmatch(r"package:/data/app/[A-Za-z0-9_~/+=.-]+/base\.apk", value):
        raise QaFailure("installed-package-unavailable", True)
    result = adb.run("shell", "sha256sum", value[8:], timeout=30).split()
    if not result or not re.fullmatch(r"[a-f0-9]{64}", result[0]):
        raise QaFailure("installed-artifact-hash-unavailable")
    return result[0]


def native_cohort(
    output: str, artifact_hash: str, corpus_hash: str, case_ids: set[str]
) -> tuple[dict[str, object], list[dict[str, object]]]:
    """Validate collector provenance/cleanup before retaining its synthetic hypotheses."""
    if not re.search(r"^INSTRUMENTATION_CODE: -1\s*$", output, re.MULTILINE):
        raise QaFailure("native-stt-collection-failed")
    fields = dict(
        re.findall(
            r"^INSTRUMENTATION_RESULT: (\w+)=(.*)$",
            output.replace("\r\n", "\n"),
            re.MULTILINE,
        )
    )
    if (
        fields.get("generatedFilesRemoved") != "true"
        or fields.get("pcmParserChecks") != "3"
    ):
        raise QaFailure("native-stt-cleanup-or-parser-unverified")
    try:
        cohort = json.loads(fields.get("cohort", "null"))
        audio = json.loads(fields.get("syntheticAudio", "null"))
        if (
            not isinstance(cohort, dict)
            or cohort.get("artifactSha256") != artifact_hash
            or cohort.get("corpusSha256") != corpus_hash
            or cohort.get("provenance") != "DIRECT_SYNTHETIC_PCM"
            or not isinstance(audio, list)
            or len(audio) != len(case_ids)
        ):
            raise ValueError("Invalid provenance.")
        if {row.get("caseId") for row in audio} != case_ids:
            raise ValueError("Invalid source cases.")
        for row in audio:
            if (
                set(row) != {"caseId", "sha256", "bytes"}
                or not isinstance(row["sha256"], str)
                or not re.fullmatch(r"[a-f0-9]{64}", row["sha256"])
                or type(row["bytes"]) is not int
                or not 46 <= row["bytes"] <= 2000000
            ):
                raise ValueError("Invalid audio evidence.")
        return cohort, audio
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise QaFailure("invalid-native-stt-cohort") from error


def collect_stt(
    adb: AdbPort, root: Path, run_id: str, artifact_hash: str, test_apk: Path
) -> dict[str, object]:
    """Generate fixed Kokoro audio and observe actual Whisper decoding without recording."""
    if test_apk.resolve().suffix != ".apk":
        raise QaFailure("explicit-test-apk-required", True)
    with test_apk.open("rb") as stream:
        test_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    if installed_hash(adb, PACKAGE + ".test") != test_hash:
        raise QaFailure("installed-test-artifact-does-not-match", True)
    corpus_bytes = (root / "evaluation/stt-corpus-v1.json").read_bytes()
    corpus_hash = hashlib.sha256(corpus_bytes).hexdigest()
    manifest = json.loads(
        (root / "evaluation/stt-fixture-manifest-v1.json").read_text(encoding="utf-8")
    )
    if manifest.get("sha256") != corpus_hash:
        raise QaFailure("frozen-stt-corpus-changed")
    case_ids = {row["id"] for row in json.loads(corpus_bytes)["samples"]}
    local = root / ".local/stt"
    local.mkdir(parents=True, exist_ok=True)
    raw = local / f"{run_id}.json"
    score_path = root / f"docs/reports/stt-{run_id}.json"
    if raw.exists() or score_path.exists():
        raise QaFailure("fresh-stt-run-id-required", True)
    output = adb.run(
        "shell",
        "am",
        "instrument",
        "-w",
        "-r",
        "-e",
        "qaOperation",
        "stt-evaluation",
        "-e",
        "artifactSha256",
        artifact_hash,
        "-e",
        "corpusSha256",
        corpus_hash,
        PACKAGE + ".test/com.lafina.LafinaDeliveryInstrumentation",
        timeout=600,
    )
    cohort, audio = native_cohort(output, artifact_hash, corpus_hash, case_ids)
    with raw.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(cohort, stream)
        stream.write("\n")
    try:
        result = subprocess.run(
            [
                "node",
                "scripts/evaluate-stt.cjs",
                "--input",
                str(raw.relative_to(root)),
                "--output",
                str(score_path.relative_to(root)),
            ],
            cwd=root,
            capture_output=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise QaFailure("stt-scorer-unavailable") from error
    if result.returncode != 0:
        raise QaFailure("stt-scorer-rejected-cohort")
    scores = json.loads(score_path.read_text(encoding="utf-8"))
    return {
        "testArtifactSha256": test_hash,
        "nativeGeneratedFilesRemoved": True,
        "syntheticAudio": audio,
        "sttScoreReport": str(score_path.relative_to(root)).replace("\\", "/"),
        "sttMetrics": scores["metrics"],
        "pcmParserChecks": 3,
        "method": "Kokoro af_bella PCM16 mono 24k; linear resample to 16k plus 1s tail; actual Whisper two threads. Cold includes context load; warm excludes it. Generation/resampling/free excluded.",
    }


def new_report(run_id: str, scenario: str, artifact_hash: str) -> dict[str, object]:
    """Build a redacted result before any actual scenario has run."""
    return {
        "version": 1,
        "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
        "runId": run_id,
        "scenario": scenario,
        "artifactSha256": artifact_hash,
        "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "status": "NOT RUN",
        "checks": [],
        "cleanupConfirmed": None,
        "limits": [
            "Emulator UI regressions, not physical-phone/audio/battery certification.",
            "Only synthetic owned tasks may be changed with explicit fixture-write opt-in.",
            "Any synthetic Chat messages are retained; history is never bulk-cleared.",
            "No radio/permission/time changes, database dumps, uninstall or data clear.",
        ],
    }


def main() -> int:
    """Execute an explicit QA scenario and preserve a fresh redacted result."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument(
        "--scenario",
        choices=("baseline", "diagnostics", "roundtrip", "full", "stt"),
        default="baseline",
    )
    parser.add_argument("--test-apk", type=Path)
    parser.add_argument("--allow-fixture-writes", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        fixture_command("create", args.run_id, "main")
        if args.scenario in ("roundtrip", "full") and not args.allow_fixture_writes:
            raise QaFailure("fixture-write-opt-in-required", True)
        if args.scenario == "stt" and args.test_apk is None:
            raise QaFailure("explicit-test-apk-required", True)
        root = Path(__file__).resolve().parents[1]
        output, apk = args.output.resolve(), args.apk.resolve()
        if (
            output.suffix != ".json"
            or not output.is_relative_to((root / "docs/reports").resolve())
            or apk.suffix != ".apk"
        ):
            raise QaFailure("invalid-artifact-or-report-path", True)
        adb = Adb(args.adb, args.serial)
        with apk.open("rb") as stream:
            artifact_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        report = new_report(args.run_id, args.scenario, artifact_hash)
        with output.open("x", encoding="utf-8", newline="\n") as stream:
            runner = UiRunner(adb, args.run_id)
            try:
                if adb.run("shell", "getprop", "ro.kernel.qemu").strip() != "1":
                    raise QaFailure("physical-device-not-authorized-by-runner", True)
                observed = installed_hash(adb, PACKAGE)
                if observed != artifact_hash:
                    raise QaFailure("installed-artifact-does-not-match", True)
                if (
                    adb.run(
                        "shell", "settings", "get", "global", "airplane_mode_on"
                    ).strip()
                    != "1"
                ):
                    raise QaFailure("enable-emulator-airplane-mode-first", True)
                report["environment"] = {
                    "kind": "Android emulator",
                    "api": int(
                        adb.run("shell", "getprop", "ro.build.version.sdk").strip()
                    ),
                    "abi": adb.run("shell", "getprop", "ro.product.cpu.abi").strip(),
                    "pageSizeBytes": int(
                        adb.run("shell", "getconf", "PAGESIZE").strip()
                    ),
                    "airplaneMode": True,
                }
                if args.scenario == "stt":
                    report.update(
                        collect_stt(
                            adb, root, args.run_id, artifact_hash, args.test_apk
                        )
                    )
                    runner.record("actual-whisper-cold-warm-cohort-collected")
                    runner.record("synthetic-source-files-removed")
                else:
                    runner.baseline()
                    if args.scenario != "baseline":
                        runner.diagnostics()
                    if args.scenario in ("roundtrip", "full"):
                        runner.roundtrip()
                report["status"] = "PASS"
            except QaFailure as error:
                report.update(
                    {
                        "status": "BLOCKED" if error.blocked else "FAIL",
                        "failureCode": error.code,
                    }
                )
            except (ValueError, OSError, IndexError):
                report.update(
                    {"status": "FAIL", "failureCode": "invalid-device-response"}
                )
            finally:
                report["checks"] = runner.checks
                report["cleanupConfirmed"] = runner.cleanup() and (
                    args.scenario != "stt"
                    or report.get("nativeGeneratedFilesRemoved") is True
                )
                if not report["cleanupConfirmed"]:
                    report["status"] = "FAIL"
                json.dump(report, stream, indent=2)
                stream.write("\n")
        print(
            json.dumps(
                {
                    "status": report["status"],
                    "checks": len(runner.checks),
                    "cleanupConfirmed": report["cleanupConfirmed"],
                }
            )
        )
        return 0 if report["status"] == "PASS" else 1
    except (QaFailure, OSError) as error:
        parser.exit(
            2,
            f"QA unavailable: {error.code if isinstance(error, QaFailure) else 'artifact-or-report-unavailable'}\n",
        )


if __name__ == "__main__":
    raise SystemExit(main())

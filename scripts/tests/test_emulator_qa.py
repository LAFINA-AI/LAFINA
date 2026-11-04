"""UI automation safety tests with synthetic XML and fake ADB only."""

import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock, patch
from xml.sax.saxutils import quoteattr

SPEC = importlib.util.spec_from_file_location(
    "emulator_qa", Path(__file__).parents[1] / "emulator_qa.py"
)
assert SPEC and SPEC.loader
QA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QA)


def snapshot(labels: list[str], draft: str | None = None) -> object:
    """Create a small private-data-bearing hierarchy for redaction checks."""
    nodes = "".join(
        f'<node text={quoteattr(label)} content-desc="" class="android.widget.TextView" '
        'clickable="true" bounds="[10,10][300,80]" />'
        for label in labels
    )
    if draft is not None:
        nodes += f'<node text={quoteattr(draft)} content-desc="" class="android.widget.EditText" bounds="[10,100][300,180]" />'
    return QA.UiSnapshot(
        '<hierarchy><node bounds="[0,0][1080,2400]">' + nodes + "</node></hierarchy>"
    )


class FakeAdb:
    """Record actions without contacting any device."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, ...]] = []

    def run(self, *args: str, timeout: int = 15) -> str:
        """Return no private output; retain the command for assertions."""
        self.calls.append(args)
        return ""


class EmulatorQaSafetyTest(unittest.TestCase):
    """Prevent user-data edits, unsafe commands, ambiguous controls and leaked XML."""

    def test_cli_refuses_missing_opt_in_physical_device_and_offline_mismatch(
        self,
    ) -> None:
        """Exercise the actual CLI gates with fake transport, never an installed app."""
        root = Path(__file__).resolve().parents[2]
        output = (
            root / "docs/reports" / f"emulator-contract-test-{uuid.uuid4().hex}.json"
        )
        temporary_root = root / ".local"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix="lafina-emulator-contract-", dir=temporary_root
        ) as temporary:
            self.assertTrue(
                Path(temporary).resolve().is_relative_to(temporary_root.resolve())
            )
            apk = Path(temporary) / "synthetic.apk"
            apk.write_bytes(b"not an APK; fake transport only")
            artifact = hashlib.sha256(apk.read_bytes()).hexdigest()
            args = [
                "emulator_qa.py",
                "--adb",
                "fake-adb",
                "--serial",
                "emulator-5554",
                "--run-id",
                "fake-contract",
                "--apk",
                str(apk),
                "--scenario",
                "full",
                "--output",
                str(output),
            ]
            runner = Mock()
            runner.checks = []
            runner.cleanup.return_value = True
            adb = Mock()
            try:
                with (
                    patch.object(sys, "argv", args),
                    patch.object(QA, "Adb", return_value=adb) as constructor,
                    patch.object(QA, "UiRunner", return_value=runner),
                    patch.object(QA, "installed_hash", return_value=artifact),
                    patch("sys.stdout", new_callable=io.StringIO),
                    patch("sys.stderr", new_callable=io.StringIO),
                ):
                    with self.assertRaises(SystemExit) as error:
                        QA.main()
                    self.assertEqual(error.exception.code, 2)
                    constructor.assert_not_called()
                    self.assertFalse(output.exists())
                    args.append("--allow-fixture-writes")
                    adb.run.return_value = "0"
                    self.assertEqual(QA.main(), 1)
                    report = json.loads(output.read_text(encoding="utf-8"))
                    self.assertEqual(
                        report["failureCode"],
                        "physical-device-not-authorized-by-runner",
                    )
                    runner.baseline.assert_not_called()
                    with self.assertRaises(SystemExit):
                        QA.main()
                    self.assertEqual(
                        json.loads(output.read_text(encoding="utf-8")), report
                    )
                    output.unlink()

                    def respond(*arguments: str, **_kwargs: object) -> str:
                        if arguments[-1] == "ro.kernel.qemu":
                            return "1"
                        if arguments[-1] == "airplane_mode_on":
                            return "0"
                        raise AssertionError("Unexpected transport operation")

                    adb.run.side_effect = respond
                    self.assertEqual(QA.main(), 1)
                    self.assertEqual(
                        json.loads(output.read_text(encoding="utf-8"))["failureCode"],
                        "enable-emulator-airplane-mode-first",
                    )
                    runner.baseline.assert_not_called()
                    output.unlink()

                    def ready(*arguments: str, **_kwargs: object) -> str:
                        return {
                            "ro.kernel.qemu": "1",
                            "airplane_mode_on": "1",
                            "ro.build.version.sdk": "37",
                            "ro.product.cpu.abi": "x86_64",
                            "PAGESIZE": "16384",
                        }[arguments[-1]]

                    adb.run.side_effect = ready
                    self.assertEqual(QA.main(), 0)
                    runner.baseline.assert_called_once()
                    runner.diagnostics.assert_called_once()
                    runner.roundtrip.assert_called_once()
                    report = json.loads(output.read_text(encoding="utf-8"))
                    self.assertEqual(report["status"], "PASS")
                    self.assertTrue(report["cleanupConfirmed"])
            finally:
                if output.exists():
                    output.unlink()

    def test_fixture_names_and_actions_are_closed(self) -> None:
        """Only this run's two exact synthetic task names can be mutated."""
        self.assertEqual(
            QA.fixture_command("create", "run01", "main"),
            'Add task "LAFINA-QA-run01-main"',
        )
        self.assertEqual(
            QA.fixture_command("delete", "run01", "cancel"),
            'Delete task "LAFINA-QA-run01-cancel"',
        )
        for run, kind, action in (
            ("../bad", "main", "create"),
            ("a;rm", "main", "delete"),
            ("ok", "student-note", "delete"),
            ("ok", "main", "bulk-delete"),
        ):
            with self.assertRaises(QA.QaFailure):
                QA.fixture_command(action, run, kind)

    def test_xml_bounds_and_entities_fail_closed(self) -> None:
        """Do not trust malformed UI coordinates or entity-bearing input."""
        for value in ("broken", "<!DOCTYPE x><hierarchy/>", "x" * 1048577):
            with self.assertRaises(QA.QaFailure):
                QA.UiSnapshot(value)
        state = QA.UiSnapshot(
            '<hierarchy><node text="Save" bounds="[-1,0][10,10]"/></hierarchy>'
        )
        with self.assertRaises(QA.QaFailure):
            state.point("Save")
        state = QA.UiSnapshot(
            '<hierarchy><node bounds="[0,0][1080,2400]">'
            '<node text="Save" bounds="[10,2500][100,2600]"/></node></hierarchy>'
        )
        with self.assertRaises(QA.QaFailure):
            state.point("Save")

    def test_missing_or_ambiguous_controls_do_not_guess(self) -> None:
        """A duplicate Confirm is not chosen arbitrarily."""
        state = snapshot(["Confirm command", "Confirm command"])
        with self.assertRaises(QA.QaFailure):
            state.point("Confirm command")
        with self.assertRaises(QA.QaFailure):
            state.point("Missing")

    def test_foreign_draft_is_never_cleared_or_sent(self) -> None:
        """Preserve an existing unsent student message before any input action."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        runner.snapshot = lambda: snapshot(["Send message"], "PRIVATE STUDENT DRAFT")
        with self.assertRaises(QA.QaFailure):
            runner.send_fixture("create", "main", "review")
        self.assertEqual(adb.calls, [])

    def test_partial_input_failure_never_claims_clean_editor(self) -> None:
        """Retain uncertain partial input and report cleanup unverified, never erase it."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        states = iter(
            [snapshot(["Send message"], ""), snapshot(["Send message"], "Add task")]
        )
        runner.snapshot = lambda: next(states)

        def fail_wait(*_args: object) -> object:
            raise QA.QaFailure("expected-ui-state-timeout")

        runner.wait_for = fail_wait
        with self.assertRaises(QA.QaFailure):
            runner.send_fixture("delete", "main", "absent")
        before = list(adb.calls)
        self.assertFalse(runner.cleanup())
        self.assertEqual(adb.calls, before)

    def test_wrong_or_unowned_review_cannot_confirm(self) -> None:
        """Matching an action button is insufficient without the exact owned summary."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        for summary in (
            "Delete task “PRIVATE STUDENT TASK”",
            "Move task “LAFINA-QA-run01-main”",
        ):
            runner.snapshot = lambda text=summary: snapshot(
                ["Review before saving", text, "Confirm command"]
            )
            with self.assertRaises(QA.QaFailure):
                runner.confirm_owned("delete", "main")
        self.assertEqual(adb.calls, [])

    def test_existing_review_is_preserved(self) -> None:
        """Never replace/cancel a pending proposal that existed before the test."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        runner.snapshot = lambda: snapshot(
            ["Review before saving", "Confirm command"], ""
        )
        with self.assertRaises(QA.QaFailure):
            runner.send_fixture("create", "main", "review")
        self.assertEqual(adb.calls, [])

    def test_only_exact_owned_draft_can_be_removed(self) -> None:
        """Even a title containing the test prefix does not authorize clearing."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        runner.last_command = QA.fixture_command("create", "run01", "main")
        runner.snapshot = lambda: snapshot(
            [], "Add task LAFINA-QA-run01-main plus private text"
        )
        with self.assertRaises(QA.QaFailure):
            runner.clear_owned_draft()
        self.assertEqual(adb.calls, [])

    def test_safe_report_has_no_ui_text_or_serial(self) -> None:
        """A report contains fixed check labels, not screenshots/hierarchy/account data."""
        report = QA.new_report("run01", "baseline", "a" * 64)
        self.assertEqual(report["status"], "NOT RUN")
        self.assertNotIn("serial", report)
        self.assertNotIn("hierarchy", str(report))

    def test_unstarted_cleanup_does_not_contact_a_device(self) -> None:
        """A blocked/missing emulator must not trigger cleanup against another device."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        self.assertTrue(runner.cleanup())
        self.assertEqual(adb.calls, [])

    def test_native_cohort_requires_exact_artifact_corpus_and_removed_sources(
        self,
    ) -> None:
        """A collector label alone cannot authorize retaining arbitrary device output."""
        cohort = {
            "artifactSha256": "a" * 64,
            "corpusSha256": "b" * 64,
            "provenance": "DIRECT_SYNTHETIC_PCM",
        }
        audio = [{"caseId": "study", "sha256": "c" * 64, "bytes": 128}]
        output = (
            "INSTRUMENTATION_RESULT: cohort=" + json.dumps(cohort) + "\n"
            "INSTRUMENTATION_RESULT: syntheticAudio=" + json.dumps(audio) + "\n"
            "INSTRUMENTATION_RESULT: generatedFilesRemoved=true\n"
            "INSTRUMENTATION_RESULT: pcmParserChecks=3\nINSTRUMENTATION_CODE: -1\n"
        )
        self.assertEqual(
            QA.native_cohort(output, "a" * 64, "b" * 64, {"study"}), (cohort, audio)
        )
        self.assertEqual(
            QA.native_cohort(
                output.replace("\n", "\r\n"), "a" * 64, "b" * 64, {"study"}
            ),
            (cohort, audio),
        )
        for value in (
            output.replace("Removed=true", "Removed=false"),
            output.replace("CODE: -1", "CODE: 0"),
        ):
            with self.assertRaises(QA.QaFailure):
                QA.native_cohort(value, "a" * 64, "b" * 64, {"study"})
        with self.assertRaises(QA.QaFailure):
            QA.native_cohort(output, "d" * 64, "b" * 64, {"study"})

    def test_installed_hash_only_reads_known_packages(self) -> None:
        """Never allow a package/path argument to become arbitrary shell input."""
        adb = FakeAdb()
        with self.assertRaises(QA.QaFailure):
            QA.installed_hash(adb, "com.other.app; rm")
        self.assertEqual(adb.calls, [])

    def test_cleanup_accepts_already_absent_owned_fixture(self) -> None:
        """A failed UI check must not require a record to exist for safe cleanup."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        runner.tracked.add("cancel")
        runner.snapshot = lambda: snapshot([], "")
        runner.send_fixture = lambda *_args: snapshot([QA.REFUSAL], "")
        runner.confirm_owned = lambda *_args: self.fail(
            "Absent fixture must not confirm"
        )
        self.assertTrue(runner.cleanup())
        self.assertEqual(adb.calls, [])

    def test_cleanup_preserves_foreign_review_that_mentions_fixture(self) -> None:
        """A quotation in a note body is not an owned task review."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        runner.tracked.add("cancel")
        runner.snapshot = lambda: snapshot(
            [
                "Review before saving",
                "Create note “Private”\n“LAFINA-QA-run01-cancel”",
                "Cancel review",
            ]
        )
        self.assertFalse(runner.cleanup())
        self.assertEqual(adb.calls, [])

    def test_only_exact_owned_result_dialog_is_acknowledged(self) -> None:
        """No-match replies are native alerts, and arbitrary OK dialogs stay untouched."""
        adb = FakeAdb()
        runner = QA.UiRunner(adb, "run01")
        runner.last_command = QA.fixture_command("delete", "run01", "main")
        states = iter([snapshot([QA.REFUSAL, "OK"]), snapshot([], "")])
        taps = []
        runner.wait_for = lambda *_args: next(states)
        runner.tap = lambda label: taps.append(label)
        runner.acknowledge_result("absent", "main")
        self.assertEqual(taps, ["OK"])
        runner.last_command = QA.fixture_command("delete", "run01", "main")
        runner.wait_for = lambda *_args: snapshot(["PRIVATE DIFFERENT ALERT", "OK"])
        with self.assertRaises(QA.QaFailure):
            runner.acknowledge_result("absent", "main")
        self.assertEqual(taps, ["OK"])

    def test_back_is_used_only_for_proven_visible_keyboard(self) -> None:
        """Never use a blind Back key to recover missing navigation controls."""

        class KeyboardAdb(FakeAdb):
            def __init__(self, flag: str) -> None:
                super().__init__()
                self.flag = flag

            def run(self, *args: str, timeout: int = 15) -> str:
                self.calls.append(args)
                return (
                    self.flag if args == ("shell", QA.KEYBOARD_VISIBILITY_QUERY) else ""
                )

        for flag, expected in [
            ("mInputShown=true", True),
            ("mInputShown=false", False),
            ("unknown", False),
        ]:
            adb = KeyboardAdb(flag)
            runner = QA.UiRunner(adb, "run01")
            runner.hide_keyboard_if_shown()
            self.assertEqual(
                ("shell", "input", "keyevent", "KEYCODE_BACK") in adb.calls, expected
            )


if __name__ == "__main__":
    unittest.main()

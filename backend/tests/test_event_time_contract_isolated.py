"""Test the pure sync contract without loading application settings."""

import unittest

from backend.app.api.event_payload import EventPayload
from pydantic import ValidationError


class EventTimeContractTest(unittest.TestCase):
    """Exercise legacy compatibility and UTC metadata validation."""

    def test_legacy_and_overnight_payloads(self) -> None:
        """Both old wall-time payloads and new UTC ranges round-trip."""
        model = EventPayload
        old = {
            "title": "Synthetic",
            "date": "2026-11-04",
            "start_time": "23:00",
            "end_time": "01:00",
        }
        self.assertIsNone(model(**old).time_zone)
        current = dict(
            old,
            end_date="2026-11-05",
            time_zone="Asia/Manila",
            start_at="2026-11-04T15:00:00.000Z",
            end_at="2026-11-04T17:00:00.000Z",
        )
        self.assertEqual(model(**current).model_dump()["end_date"], "2026-11-05")
        for patch in [
            {"end_at": current["start_at"]},
            {"start_fold": "guess"},
            {"time_zone": None},
            {"start_at": None},
            {"unexpected": True},
        ]:
            with self.assertRaises(ValidationError):
                model(**dict(current, **patch))


if __name__ == "__main__":
    unittest.main()

"""Pure event wire contract; importing it does not load credentials or settings."""

from collections.abc import Mapping
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventPayload(BaseModel):
    """Backward-compatible event sync payload with optional explicit UTC range."""

    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., max_length=256)
    date: str
    start_time: str
    end_time: str
    location: str | None = None
    end_date: str | None = None
    time_zone: str | None = Field(None, max_length=100)
    start_at: str | None = None
    end_at: str | None = None
    start_fold: Literal["earlier", "later"] | None = None
    end_fold: Literal["earlier", "later"] | None = None
    linked_calendar_block: str | None = None
    recurrence_rule: str | None = None

    @model_validator(mode="after")
    def validate_event_instants(self) -> "EventPayload":
        """Keep legacy payloads valid and require complete, ordered UTC metadata."""
        if self.time_zone is None:
            if any(
                value is not None
                for value in (
                    self.end_date,
                    self.start_at,
                    self.end_at,
                    self.start_fold,
                    self.end_fold,
                )
            ):
                raise ValueError("event metadata requires a timezone")
            return self
        if not self.time_zone.strip() or not self.end_date or not self.start_at or not self.end_at:
            raise ValueError("timezone events require end_date and both UTC instants")
        if not self.start_at.endswith("Z") or not self.end_at.endswith("Z"):
            raise ValueError("event instants must be UTC timestamps ending in Z")
        date.fromisoformat(self.end_date)
        start = datetime.fromisoformat(self.start_at)
        end = datetime.fromisoformat(self.end_at)
        if end <= start or (end - start).total_seconds() > 31 * 86400:
            raise ValueError("event UTC range must be positive and at most 31 days")
        return self


def normalize_event_sync_payload(
    payload: Mapping[str, object], previous: Mapping[str, object] | None = None
) -> dict[str, object]:
    """Preserve omitted legacy metadata only when the existing wall range is unchanged."""
    metadata = ("end_date", "time_zone", "start_at", "end_at", "start_fold", "end_fold")
    merged = dict(payload)
    if (
        previous
        and previous.get("time_zone")
        and not any(key in payload for key in metadata)
        and all(previous.get(key) == payload.get(key) for key in ("date", "start_time", "end_time"))
    ):
        merged.update({key: previous[key] for key in metadata if key in previous})
    return EventPayload(**merged).model_dump(exclude_unset=True)

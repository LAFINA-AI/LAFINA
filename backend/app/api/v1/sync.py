import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.models.account import Account
from backend.app.models.session import AuthSession
from backend.app.models.mutations import IdempotentMutation
from backend.app.models.change_feed import ChangeFeed
from backend.app.models.sync_head import SyncHead
from backend.app.models.synchronized_content import (
    ProfileSync, TasksSync, EventsSync, TimeBlocksSync,
    RemindersSync, NotesSync, CustomCategoriesSync
)
from backend.app.security.auth import get_current_user_and_session

router = APIRouter(prefix="/v1/sync", tags=["sync"])

# Strict typed entity payloads forbidding unknown/untrusted fields (extra="forbid")
class TaskPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., max_length=256)
    due_date: str | None = None
    due_time: str | None = None
    is_completed: bool = False
    priority: Literal["High", "Medium", "Low"] = "Medium"
    category: str = Field("General", max_length=64)
    notes: str | None = None
    recurrence_rule: str | None = None

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: object) -> str:
        """Normalize accepted task priorities to the mobile canonical casing."""
        if not isinstance(value, str):
            raise ValueError("priority must be High, Medium, or Low")
        normalized = value.strip().lower()
        priority_map = {
            "high": "High",
            "medium": "Medium",
            "low": "Low",
        }
        if normalized not in priority_map:
            raise ValueError("priority must be High, Medium, or Low")
        return priority_map[normalized]

class EventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., max_length=256)
    date: str
    start_time: str
    end_time: str
    location: str | None = None
    linked_calendar_block: str | None = None
    recurrence_rule: str | None = None

class TimeBlockPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., max_length=256)
    date: str
    start_time: str
    end_time: str
    color: str
    category: str
    notes: str | None = None
    recurrence_rule: str | None = None

class ReminderPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task: str = Field(..., max_length=256)
    description: str | None = None
    scheduled_at: str
    trigger_at: str
    status: str = "pending"
    snooze_count: int = 0

class NotePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., max_length=256)
    body: str
    is_pinned: bool = False
    tags: str = "[]"
    category: str = "General"
    is_voice_transcribed: bool = False
    sort_order: int = 0

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: str) -> str:
        """Require and canonicalize a JSON array of string note tags."""
        try:
            parsed: object = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("tags must be a JSON array of strings") from exc
        if not isinstance(parsed, list) or not all(
            isinstance(tag, str) for tag in parsed
        ):
            raise ValueError("tags must be a JSON array of strings")
        return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))

class CustomCategoryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., max_length=128)
    color: str = Field(..., max_length=32)

class ProfilePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(..., max_length=128)
    wake_time: str = "07:00"
    sleep_time: str = "23:00"
    study_peak_hours: str = "[]"
    busiest_day: str = "Monday"
    reminder_lead_minutes: int = 15
    snooze_tendency: str = "snooze_once"
    weekly_class_count: str = "4-6"
    longest_class_gap: str = "1 hour"
    time_format_24h: bool = False
    week_starts_monday: bool = False
    dark_mode: bool = False

EntityType = Literal["profile", "task", "event", "time_block", "reminder", "note", "custom_category"]
OperationType = Literal["create", "update", "delete"]

class SyncMutation(BaseModel):
    mutationId: str = Field(..., max_length=128)
    entityType: EntityType
    entityId: str = Field(..., max_length=128)
    operation: OperationType
    clientUpdatedAt: datetime
    baseVersion: int | None = Field(default=None, ge=0)
    payload: dict

    @field_validator("clientUpdatedAt")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        """Reject ambiguous device timestamps while keeping server order authoritative."""
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clientUpdatedAt must include a timezone offset")
        return value


class SnapshotPosition(BaseModel):
    """Opaque keyset position for a current-state snapshot page."""

    model_config = ConfigDict(extra="forbid")

    entityType: EntityType
    entityId: str = Field(..., max_length=128)


class SnapshotRequest(BaseModel):
    """Request the next page of a stable current-state snapshot."""

    model_config = ConfigDict(extra="forbid")

    boundaryCursor: int | None = Field(default=None, ge=0)
    after: SnapshotPosition | None = None

    @model_validator(mode="after")
    def require_boundary_for_continuation(self) -> "SnapshotRequest":
        """Prevent continuation tokens from moving to a newly chosen boundary."""
        if self.after is not None and self.boundaryCursor is None:
            raise ValueError("snapshot continuation requires boundaryCursor")
        return self


class SyncBatchRequest(BaseModel):
    mutations: list[SyncMutation] = Field(default_factory=list, max_length=100)
    cursor: int = Field(default=0, ge=0)
    snapshot: SnapshotRequest | None = None

class MutationResult(BaseModel):
    mutationId: str
    entityType: EntityType
    entityId: str
    status: Literal["accepted", "rejected"]
    reason: str | None = None
    serverVersion: int | None = None
    serverPayload: dict | None = None

class ChangeItem(BaseModel):
    changeId: int
    entityType: EntityType
    entityId: str
    operation: OperationType
    version: int
    payload: dict
    updatedAt: str
    deletedAt: str | None = None


class SnapshotPrunePolicy(BaseModel):
    """Rules a client must honor before pruning server-missing local rows."""

    preserveOutboxStatuses: list[Literal["pending", "in_progress", "failed"]]
    requireExistingSyncMetadata: bool


class SnapshotPage(BaseModel):
    """A keyset-paginated, authoritative view of synchronized server state."""

    boundaryCursor: int
    items: list[ChangeItem]
    nextAfter: SnapshotPosition | None
    hasMore: bool
    complete: bool
    authoritativeEntityTypes: list[EntityType]
    prunePolicy: SnapshotPrunePolicy


class SyncBatchResponse(BaseModel):
    accepted: list[MutationResult]
    rejected: list[MutationResult]
    changes: list[ChangeItem]
    nextCursor: int
    hasMore: bool
    resetRequired: bool
    serverTime: str
    snapshot: SnapshotPage | None = None

MODEL_MAP = {
    "profile": ProfileSync,
    "task": TasksSync,
    "event": EventsSync,
    "time_block": TimeBlocksSync,
    "reminder": RemindersSync,
    "note": NotesSync,
    "custom_category": CustomCategoriesSync
}

PAYLOAD_VALIDATOR_MAP = {
    "profile": ProfilePayload,
    "task": TaskPayload,
    "event": EventPayload,
    "time_block": TimeBlockPayload,
    "reminder": ReminderPayload,
    "note": NotePayload,
    "custom_category": CustomCategoryPayload
}

FORBIDDEN_KEYS = {"owner_id", "role", "password_hash", "entitlements", "ai_limit", "server_timestamp"}
SNAPSHOT_PAGE_SIZE = 500
SNAPSHOT_MODEL_ORDER = (
    ("profile", ProfileSync),
    ("task", TasksSync),
    ("event", EventsSync),
    ("time_block", TimeBlocksSync),
    ("reminder", RemindersSync),
    ("note", NotesSync),
    ("custom_category", CustomCategoriesSync),
)
SNAPSHOT_AUTHORITATIVE_ENTITY_TYPES: list[EntityType] = [
    "task",
    "event",
    "time_block",
    "reminder",
    "note",
    "custom_category",
]


def _utc_iso(value: datetime) -> str:
    """Serialize database timestamps with an explicit UTC offset."""
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


async def _current_snapshot_boundary(
    db: AsyncSession,
    owner_id: uuid.UUID,
) -> int:
    """Return the latest owner-scoped change represented by current state."""
    head_result = await db.execute(
        select(SyncHead.latest_change_id).where(
            SyncHead.owner_id == owner_id
        )
    )
    persisted_head = head_result.scalar_one_or_none()
    if persisted_head is not None:
        return persisted_head

    # Legacy fallback for a database being upgraded before the backfill lands.
    boundary = 0
    for _, model_cls in SNAPSHOT_MODEL_ORDER:
        result = await db.execute(
            select(func.max(model_cls.change_id)).where(
                model_cls.owner_id == owner_id
            )
        )
        boundary = max(boundary, result.scalar_one_or_none() or 0)

    feed_result = await db.execute(
        select(func.max(ChangeFeed.change_id)).where(
            ChangeFeed.owner_id == owner_id
        )
    )
    return max(boundary, feed_result.scalar_one_or_none() or 0)


async def _advance_sync_head(
    db: AsyncSession,
    owner_id: uuid.UUID,
    change_id: int,
    updated_at: datetime,
) -> None:
    """Advance an owner's durable high-water mark without allowing regression."""
    result = await db.execute(
        select(SyncHead)
        .where(SyncHead.owner_id == owner_id)
        .with_for_update()
    )
    head = result.scalar_one_or_none()
    if head is None:
        db.add(
            SyncHead(
                owner_id=owner_id,
                latest_change_id=change_id,
                updated_at=updated_at,
            )
        )
    elif change_id > head.latest_change_id:
        head.latest_change_id = change_id
        head.updated_at = updated_at
    await db.flush()


async def _cursor_requires_snapshot(
    db: AsyncSession,
    owner_id: uuid.UUID,
    cursor: int,
) -> bool:
    """Detect whether retained deltas can reconstruct current server state."""
    boundary = await _current_snapshot_boundary(db, owner_id)
    if cursor > boundary:
        return True
    if cursor == boundary:
        return False

    latest_retained_result = await db.execute(
        select(func.max(ChangeFeed.change_id)).where(
            ChangeFeed.owner_id == owner_id,
            ChangeFeed.change_id > cursor,
        )
    )
    latest_retained = latest_retained_result.scalar_one_or_none()
    if latest_retained is None or latest_retained < boundary:
        return True

    for _, model_cls in SNAPSHOT_MODEL_ORDER:
        retained_latest_change = select(ChangeFeed.change_id).where(
            ChangeFeed.owner_id == owner_id,
            ChangeFeed.change_id == model_cls.change_id,
        ).exists()
        missing_result = await db.execute(
            select(model_cls.change_id)
            .where(
                model_cls.owner_id == owner_id,
                model_cls.change_id > cursor,
                ~retained_latest_change,
            )
            .limit(1)
        )
        if missing_result.scalar_one_or_none() is not None:
            return True
    return False


def _snapshot_change_item(
    entity_type: EntityType,
    row: object,
) -> ChangeItem:
    """Convert a synchronized current-state row into the shared change shape."""
    deleted_at = getattr(row, "deleted_at")
    updated_at = getattr(row, "updated_at")
    is_deleted = deleted_at is not None
    return ChangeItem(
        changeId=getattr(row, "change_id"),
        entityType=entity_type,
        entityId=getattr(row, "client_id"),
        operation="delete" if is_deleted else "update",
        version=getattr(row, "version"),
        payload={} if is_deleted else getattr(row, "payload"),
        updatedAt=_utc_iso(updated_at),
        deletedAt=_utc_iso(deleted_at) if deleted_at is not None else None,
    )


async def _build_snapshot_page(
    db: AsyncSession,
    owner_id: uuid.UUID,
    request: SnapshotRequest,
) -> SnapshotPage:
    """Build one stable, keyset-paginated current-state snapshot page."""
    current_boundary = await _current_snapshot_boundary(db, owner_id)
    boundary = (
        current_boundary
        if request.boundaryCursor is None
        else request.boundaryCursor
    )
    if boundary > current_boundary:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="snapshot boundary is ahead of current server state",
        )

    after_type = request.after.entityType if request.after else None
    after_id = request.after.entityId if request.after else None
    after_rank = (
        next(
            index
            for index, (entity_type, _) in enumerate(SNAPSHOT_MODEL_ORDER)
            if entity_type == after_type
        )
        if after_type is not None
        else 0
    )

    collected: list[tuple[EntityType, object]] = []
    fetch_limit = SNAPSHOT_PAGE_SIZE + 1
    for rank, (entity_type, model_cls) in enumerate(SNAPSHOT_MODEL_ORDER):
        if rank < after_rank:
            continue

        conditions = [
            model_cls.owner_id == owner_id,
            model_cls.change_id <= boundary,
        ]
        if rank == after_rank and after_id is not None:
            conditions.append(model_cls.client_id > after_id)

        remaining = fetch_limit - len(collected)
        if remaining <= 0:
            break
        result = await db.execute(
            select(model_cls)
            .where(*conditions)
            .order_by(model_cls.client_id.asc())
            .limit(remaining)
        )
        collected.extend(
            (entity_type, row) for row in result.scalars().all()
        )
        if len(collected) >= fetch_limit:
            break

    has_more = len(collected) > SNAPSHOT_PAGE_SIZE
    page_rows = collected[:SNAPSHOT_PAGE_SIZE]
    items = [
        _snapshot_change_item(entity_type, row)
        for entity_type, row in page_rows
    ]
    next_after = (
        SnapshotPosition(
            entityType=page_rows[-1][0],
            entityId=getattr(page_rows[-1][1], "client_id"),
        )
        if has_more and page_rows
        else None
    )

    return SnapshotPage(
        boundaryCursor=boundary,
        items=items,
        nextAfter=next_after,
        hasMore=has_more,
        complete=not has_more,
        authoritativeEntityTypes=SNAPSHOT_AUTHORITATIVE_ENTITY_TYPES,
        prunePolicy=SnapshotPrunePolicy(
            preserveOutboxStatuses=["pending", "in_progress", "failed"],
            requireExistingSyncMetadata=True,
        ),
    )


async def _lock_batch_mutations(
    db: AsyncSession,
    owner_id: uuid.UUID,
    mutations: list[SyncMutation],
) -> None:
    """Serialize overlapping PostgreSQL mutations, including first creates.

    Row locks protect existing records, but there is no row to lock for two
    concurrent creates. Transaction-scoped advisory locks close that gap. Keys
    are sorted before acquisition so overlapping batches cannot deadlock merely
    because clients sent mutations in different orders.
    """
    if db.get_bind().dialect.name != "postgresql":
        return

    owner_key = str(owner_id)
    lock_keys = {
        f"mutation:{owner_key}:{mutation.mutationId}"
        for mutation in mutations
    }
    lock_keys.update(
        f"entity:{owner_key}:{mutation.entityType}:{mutation.entityId}"
        for mutation in mutations
    )
    if mutations:
        lock_keys.add(f"sync-head:{owner_key}")
    for lock_key in sorted(lock_keys):
        await db.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                "hashtextextended(:lock_key, 0)"
                ")"
            ),
            {"lock_key": lock_key},
        )


def _restore_idempotent_result(
    mutation: SyncMutation,
    record: IdempotentMutation,
) -> MutationResult:
    """Rebuild a terminal response without applying the mutation twice."""
    stored = record.response_payload or {}
    stored_status = stored.get("status")
    result_status: Literal["accepted", "rejected"] = (
        "rejected" if stored_status == "rejected" else "accepted"
    )
    reason = stored.get("reason")
    if result_status == "accepted":
        reason = "idempotent_duplicate"

    server_version = stored.get("serverVersion")
    return MutationResult(
        mutationId=str(stored.get("mutationId", mutation.mutationId)),
        entityType=stored.get("entityType", mutation.entityType),
        entityId=str(stored.get("entityId", mutation.entityId)),
        status=result_status,
        reason=reason if isinstance(reason, str) else None,
        serverVersion=server_version if isinstance(server_version, int) else None,
        serverPayload=(
            stored.get("serverPayload")
            if isinstance(stored.get("serverPayload"), dict)
            else None
        ),
    )


async def _record_terminal_result(
    db: AsyncSession,
    owner_id: uuid.UUID,
    mutation: SyncMutation,
    result: MutationResult,
) -> None:
    """Persist accepted and rejected outcomes under the owner's idempotency key."""
    db.add(
        IdempotentMutation(
            mutation_id=mutation.mutationId,
            owner_id=owner_id,
            status=result.status,
            response_payload=result.model_dump(exclude_none=True),
            client_updated_at=mutation.clientUpdatedAt.astimezone(timezone.utc),
        )
    )
    await db.flush()


@router.post("/batch", response_model=SyncBatchResponse)
async def sync_batch(
    req: SyncBatchRequest,
    auth_data: Annotated[tuple[Account, AuthSession], Depends(get_current_user_and_session)],
    db: AsyncSession = Depends(get_db)
):
    account, _ = auth_data
    owner_id = account.id
    now = datetime.now(timezone.utc)
    now_str = now.isoformat()

    if len(req.mutations) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Batch exceeds maximum of 100 mutations.")

    accepted_results: list[MutationResult] = []
    rejected_results: list[MutationResult] = []

    await _lock_batch_mutations(db, owner_id, req.mutations)

    for mut in req.mutations:
        idempotent_stmt = select(IdempotentMutation).where(
            IdempotentMutation.mutation_id == mut.mutationId,
            IdempotentMutation.owner_id == owner_id
        )
        idem_res = await db.execute(idempotent_stmt)
        existing_idem = idem_res.scalar_one_or_none()

        if existing_idem:
            duplicate_result = _restore_idempotent_result(mut, existing_idem)
            if duplicate_result.status == "accepted":
                accepted_results.append(duplicate_result)
            else:
                rejected_results.append(duplicate_result)
            continue

        if mut.entityType == "profile" and mut.operation == "delete":
            profile_delete_result = MutationResult(
                mutationId=mut.mutationId,
                entityType=mut.entityType,
                entityId=mut.entityId,
                status="rejected",
                reason="profile_delete_not_allowed",
            )
            await _record_terminal_result(
                db,
                owner_id,
                mut,
                profile_delete_result,
            )
            rejected_results.append(profile_delete_result)
            continue

        if any(key in mut.payload for key in FORBIDDEN_KEYS):
            forbidden_result = MutationResult(
                mutationId=mut.mutationId,
                entityType=mut.entityType,
                entityId=mut.entityId,
                status="rejected",
                reason="Forbidden untrusted client payload fields detected"
            )
            await _record_terminal_result(db, owner_id, mut, forbidden_result)
            rejected_results.append(forbidden_result)
            continue

        validator_cls = PAYLOAD_VALIDATOR_MAP.get(mut.entityType)
        if mut.operation != "delete" and validator_cls:
            try:
                validated_payload = validator_cls(**mut.payload).model_dump()
            except Exception as e:
                validation_result = MutationResult(
                    mutationId=mut.mutationId,
                    entityType=mut.entityType,
                    entityId=mut.entityId,
                    status="rejected",
                    reason=f"Payload validation failed: {str(e)}"
                )
                await _record_terminal_result(db, owner_id, mut, validation_result)
                rejected_results.append(validation_result)
                continue
        else:
            validated_payload = {}

        model_cls = MODEL_MAP.get(mut.entityType)
        if not model_cls:
            unknown_result = MutationResult(
                mutationId=mut.mutationId,
                entityType=mut.entityType,
                entityId=mut.entityId,
                status="rejected",
                reason=f"Unknown entity type {mut.entityType}"
            )
            await _record_terminal_result(db, owner_id, mut, unknown_result)
            rejected_results.append(unknown_result)
            continue

        entity_stmt = select(model_cls).where(
            model_cls.owner_id == owner_id,
            model_cls.client_id == mut.entityId
        ).with_for_update()
        entity_res = await db.execute(entity_stmt)
        existing_entity = entity_res.scalar_one_or_none()

        server_version = existing_entity.version if existing_entity else 0
        if mut.baseVersion is not None and mut.baseVersion != server_version:
            conflict_result = MutationResult(
                mutationId=mut.mutationId,
                entityType=mut.entityType,
                entityId=mut.entityId,
                status="rejected",
                reason="version_conflict",
                serverVersion=server_version,
                serverPayload=existing_entity.payload if existing_entity else {},
            )
            await _record_terminal_result(db, owner_id, mut, conflict_result)
            rejected_results.append(conflict_result)
            continue

        new_version = server_version + 1
        change_payload = {} if mut.operation == "delete" else validated_payload
        change_record = ChangeFeed(
            owner_id=owner_id,
            entity_type=mut.entityType,
            entity_id=mut.entityId,
            operation=mut.operation,
            version=new_version,
            payload=change_payload,
            created_at=now,
        )
        db.add(change_record)
        await db.flush()
        new_change_id = change_record.change_id
        await _advance_sync_head(db, owner_id, new_change_id, now)

        if mut.operation == "delete":
            deleted_at_val = now
            if existing_entity:
                existing_entity.deleted_at = deleted_at_val
                existing_entity.version = new_version
                existing_entity.change_id = new_change_id
                existing_entity.updated_at = now
            else:
                db.add(model_cls(
                    owner_id=owner_id,
                    client_id=mut.entityId,
                    version=new_version,
                    change_id=new_change_id,
                    payload={},
                    updated_at=now,
                    deleted_at=deleted_at_val
                ))
        else:
            if existing_entity:
                existing_entity.payload = validated_payload
                existing_entity.version = new_version
                existing_entity.change_id = new_change_id
                existing_entity.updated_at = now
                existing_entity.deleted_at = None
            else:
                db.add(model_cls(
                    owner_id=owner_id,
                    client_id=mut.entityId,
                    version=new_version,
                    change_id=new_change_id,
                    payload=validated_payload,
                    updated_at=now,
                    deleted_at=None
                ))

        accepted_result = MutationResult(
            mutationId=mut.mutationId,
            entityType=mut.entityType,
            entityId=mut.entityId,
            status="accepted",
            serverVersion=new_version,
        )
        await _record_terminal_result(db, owner_id, mut, accepted_result)
        accepted_results.append(accepted_result)

    # Flush once more before pull queries. The request-scoped dependency commits
    # after the response is built, keeping the PostgreSQL RLS setting active for
    # both push and pull portions of this transaction.
    await db.flush()

    if req.snapshot is not None:
        snapshot_page = await _build_snapshot_page(
            db,
            owner_id,
            req.snapshot,
        )
        return SyncBatchResponse(
            accepted=accepted_results,
            rejected=rejected_results,
            changes=[],
            nextCursor=req.cursor,
            hasMore=False,
            resetRequired=False,
            serverTime=now_str,
            snapshot=snapshot_page,
        )

    reset_required = await _cursor_requires_snapshot(
        db,
        owner_id,
        req.cursor,
    )
    if reset_required:
        return SyncBatchResponse(
            accepted=accepted_results,
            rejected=rejected_results,
            changes=[],
            nextCursor=req.cursor,
            hasMore=False,
            resetRequired=True,
            serverTime=now_str,
        )

    changes_stmt = select(ChangeFeed).where(
        ChangeFeed.owner_id == owner_id,
        ChangeFeed.change_id > req.cursor
    ).order_by(ChangeFeed.change_id.asc()).limit(501)

    changes_res = await db.execute(changes_stmt)
    change_records = list(changes_res.scalars().all())

    has_more = len(change_records) > 500
    paged_changes = change_records[:500]

    out_changes: list[ChangeItem] = []
    next_cursor = req.cursor
    for c in paged_changes:
        out_changes.append(ChangeItem(
            changeId=c.change_id,
            entityType=c.entity_type,
            entityId=c.entity_id,
            operation=c.operation,
            version=c.version,
            payload=c.payload,
            updatedAt=_utc_iso(c.created_at),
            deletedAt=_utc_iso(c.created_at) if c.operation == "delete" else None,
        ))
        next_cursor = c.change_id

    return SyncBatchResponse(
        accepted=accepted_results,
        rejected=rejected_results,
        changes=out_changes,
        nextCursor=next_cursor,
        hasMore=has_more,
        resetRequired=False,
        serverTime=now_str
    )

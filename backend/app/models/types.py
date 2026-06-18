"""Portable column types shared across ORM models."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import CHAR, DateTime
from sqlalchemy.types import TypeDecorator


class GUID(TypeDecorator):
    """Database-agnostic UUID column.

    Stored as ``CHAR(36)`` (canonical hyphenated form) and surfaced to Python
    as :class:`uuid.UUID`. Lets the same models run on MySQL — which has no
    native UUID type — without dialect-specific code. UUID values are generated
    application-side (``default=uuid.uuid4``) because MySQL has no
    ``RETURNING`` to read back a server-side default after ``INSERT``.
    """

    impl = CHAR(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class TZDateTime(TypeDecorator):
    """Timezone-aware UTC datetime that survives any backend.

    PostgreSQL ``TIMESTAMPTZ`` returns timezone-aware datetimes, but MySQL
    ``DATETIME`` (and SQLite) return **naive** ones. App code does UTC-aware
    arithmetic (``datetime.now(UTC) - row.created_at``), which raises
    ``TypeError: can't subtract offset-naive and offset-aware datetimes`` once
    the value comes back naive. This decorator normalises both directions:

    * **bind**: an aware value is converted to UTC; a naive value is assumed to
      already be UTC. The wire value is stored naive (MySQL ``DATETIME`` has no
      tz), which is fine because we always store UTC.
    * **result**: a naive value read back is stamped with ``tzinfo=UTC`` so the
      caller always gets an aware UTC datetime.

    ``timezone=True`` is kept on the underlying ``DateTime`` so PostgreSQL (if
    ever used again) still gets a real ``TIMESTAMPTZ``.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, datetime) and value.tzinfo is not None:
            return value.astimezone(UTC)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

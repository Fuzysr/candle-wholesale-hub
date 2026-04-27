"""Allowed transitions of `OrderStatus` for the wholesale flow.

Before this module existed, `PATCH /admin/orders/{id}` accepted ANY
status from ANY current status (HIGH #3). That meant an admin (or anyone
with a stolen admin token) could:

* mark a `cancelled` order as `paid` — defeating the audit trail;
* skip from `new` straight to `shipped`, never reserving payment, never
  releasing stock through the proper reservation hooks;
* "uncancel" an already-cancelled order whose stock had been released
  to other customers, leading to oversells.

Each of the bespoke flow endpoints (`/approve`, `/reject`, `/upload-receipt`,
`/confirm-payment`, `/mark-shipped`) already gates its own `from` status,
but the catch-all `PATCH` endpoint did not — this module is what fixes
that single hole, and it is now the canonical reference for "is this
status change legal?".

Design notes:

* Both `completed` and `cancelled` are TERMINAL. Refunds / re-creations
  are handled by cloning a new order, not by un-terminal-ing.
* Setting the status to its current value is always legal (no-op).
* Side-effect orchestration (releasing reservations, consuming stock)
  is NOT done here — the caller still applies them after the gate
  passes. Keeping side-effects in the router means the state machine
  stays a pure function and is trivially unit-testable.
"""
from __future__ import annotations

from fastapi import HTTPException, status as http_status

from app.models.enums import OrderStatus

# Map: current status → set of statuses we accept as the next state.
# A state with NO entry here (or an empty set) is terminal.
ALLOWED_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.new: frozenset({
        OrderStatus.processing,
        OrderStatus.awaiting_payment,
        OrderStatus.cancelled,
    }),
    OrderStatus.processing: frozenset({
        OrderStatus.awaiting_payment,
        OrderStatus.new,            # admin reverts to triage queue
        OrderStatus.cancelled,
    }),
    OrderStatus.awaiting_payment: frozenset({
        # Customer uploads a receipt → payment_review.
        OrderStatus.payment_review,
        # Manual fast-tracks: admin already saw the wire transfer or
        # marked the order as invoiced for legal/accounting reasons.
        OrderStatus.invoiced,
        OrderStatus.paid,
        OrderStatus.cancelled,
    }),
    OrderStatus.payment_review: frozenset({
        OrderStatus.paid,
        # Receipt is bogus / wrong amount → admin sends them back to the
        # awaiting_payment step rather than cancelling outright.
        OrderStatus.awaiting_payment,
        OrderStatus.cancelled,
    }),
    OrderStatus.invoiced: frozenset({
        OrderStatus.paid,
        OrderStatus.cancelled,
    }),
    OrderStatus.paid: frozenset({
        OrderStatus.shipped,
        # Refund / wire reversal — rare but real. Cancellation from
        # `paid` requires the admin to also handle the money refund
        # outside the system.
        OrderStatus.cancelled,
    }),
    OrderStatus.shipped: frozenset({
        # Once goods leave the warehouse the only legal next step is
        # «closed» — cancellation now requires an entirely different
        # workflow (returns / refunds) and we do NOT model it here.
        OrderStatus.completed,
    }),
    # Terminal states.
    OrderStatus.completed: frozenset(),
    OrderStatus.cancelled: frozenset(),
}


def is_transition_allowed(current: OrderStatus, target: OrderStatus) -> bool:
    """Pure function — no I/O, no exceptions. The router uses
    :func:`assert_transition_allowed` for the actual gate; tests use
    this overload to enumerate the matrix.
    """
    if current == target:
        # No-op: setting the same status is always allowed and never
        # triggers side-effects in the caller (it short-circuits the
        # `status_changed` flag in the router).
        return True
    return target in ALLOWED_TRANSITIONS.get(current, frozenset())


def assert_transition_allowed(
    current: OrderStatus, target: OrderStatus
) -> None:
    """Raise HTTP 409 if `current → target` is not in the matrix.

    409 (Conflict) is the right code here: the server has consistent
    state but the requested mutation is incompatible with that state.
    The error message is in Russian to match the rest of the admin UI
    error surfaces — `admin_approve_order` and friends already speak
    Russian to the operator.
    """
    if is_transition_allowed(current, target):
        return

    allowed = ALLOWED_TRANSITIONS.get(current, frozenset())
    if not allowed:
        detail = (
            f"невозможно изменить статус заявки в состоянии "
            f"«{current.value}» — это терминальный статус"
        )
    else:
        allowed_str = ", ".join(sorted(s.value for s in allowed))
        detail = (
            f"переход «{current.value}» → «{target.value}» запрещён. "
            f"Допустимые переходы: {allowed_str}"
        )
    raise HTTPException(
        status_code=http_status.HTTP_409_CONFLICT,
        detail=detail,
    )

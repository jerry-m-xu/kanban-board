from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

ColumnStatus = Literal["backlog", "todo", "in-progress", "done"]

PAST_OR_TODAY_STATUSES = frozenset({"backlog", "done"})
TODAY_OR_FUTURE_STATUSES = frozenset({"todo", "in-progress"})


def due_date_allowed_for_status(status: str, due_date: Optional[str]) -> Optional[str]:
    """Return an error message if status/due_date pair is invalid, else None."""
    if not due_date:
        return "due_date is required"

    today = date.today().isoformat()
    if status in PAST_OR_TODAY_STATUSES and due_date > today:
        return "Backlog and Done only allow tasks due today or earlier"
    if status in TODAY_OR_FUTURE_STATUSES and due_date < today:
        return "To-do and In Progress only allow tasks due today or later"
    return None


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    status: ColumnStatus = "backlog"
    due_date: Optional[str] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ColumnStatus] = None
    position: Optional[int] = None
    due_date: Optional[str] = None


class Item(BaseModel):
    id: int
    name: str
    description: str = ""
    status: ColumnStatus = "backlog"
    position: int = 0
    due_date: Optional[str] = None

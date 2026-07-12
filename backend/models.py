from typing import Literal, Optional

from pydantic import BaseModel, Field

ColumnStatus = Literal["backlog", "todo", "in-progress", "done"]


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    status: ColumnStatus = "backlog"


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ColumnStatus] = None
    position: Optional[int] = None


class Item(BaseModel):
    id: int
    name: str
    description: str = ""
    status: ColumnStatus = "backlog"
    position: int = 0

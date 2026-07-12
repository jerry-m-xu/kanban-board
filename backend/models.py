import json
from datetime import date
from typing import Dict, List, Literal, Optional, Set

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


def normalize_prerequisites(values: Optional[List[int]]) -> List[int]:
    if not values:
        return []
    seen: Set[int] = set()
    result: List[int] = []
    for value in values:
        prerequisite_id = int(value)
        if prerequisite_id in seen:
            continue
        seen.add(prerequisite_id)
        result.append(prerequisite_id)
    return result


def prerequisites_create_cycle(
    prerequisite_map: Dict[int, List[int]],
    item_id: int,
    prerequisites: List[int],
) -> bool:
    """Return True if assigning prerequisites to item_id would introduce a cycle."""
    if item_id in prerequisites:
        return True

    graph = {key: list(values) for key, values in prerequisite_map.items()}
    graph[item_id] = list(prerequisites)

    # Edge direction: prerequisite -> dependent
    adjacency: Dict[int, List[int]] = {}
    for dependent_id, prereq_ids in graph.items():
        for prereq_id in prereq_ids:
            adjacency.setdefault(prereq_id, []).append(dependent_id)

    visiting: Set[int] = set()
    visited: Set[int] = set()

    def visit(node_id: int) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        for next_id in adjacency.get(node_id, []):
            if visit(next_id):
                return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    return any(visit(node_id) for node_id in list(graph.keys()) + list(adjacency.keys()))


def validate_prerequisites(
    item_id: Optional[int],
    status: str,
    prerequisites: List[int],
    existing_items: Dict[int, List[int]],
    status_by_id: Dict[int, str],
) -> Optional[str]:
    for prereq_id in prerequisites:
        if prereq_id not in existing_items:
            return f"prerequisite {prereq_id} does not exist"
        if item_id is not None and prereq_id == item_id:
            return "an item cannot be a prerequisite of itself"

    if status == "done":
        for prereq_id in prerequisites:
            if status_by_id.get(prereq_id) != "done":
                return "Done tasks can only have prerequisites that are also in Done"

    if item_id is None:
        return None

    if prerequisites_create_cycle(existing_items, item_id, prerequisites):
        return "prerequisites would create a cycle"
    return None


def validate_status_move_for_prerequisites(
    item_id: int,
    new_status: str,
    prerequisites: List[int],
    prerequisite_map: Dict[int, List[int]],
    status_by_id: Dict[int, str],
) -> Optional[str]:
    """Validate status changes against Done prerequisite rules."""
    if new_status == "done":
        for prereq_id in prerequisites:
            if prereq_id not in status_by_id:
                return f"prerequisite {prereq_id} does not exist"
            if status_by_id.get(prereq_id) != "done":
                return "Done tasks can only have prerequisites that are also in Done"
        return None

    for dependent_id, prereq_ids in prerequisite_map.items():
        if dependent_id == item_id:
            continue
        if item_id in prereq_ids and status_by_id.get(dependent_id) == "done":
            return (
                "Cannot move this task out of Done while other Done tasks "
                "still list it as a prerequisite"
            )
    return None


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    status: ColumnStatus = "backlog"
    due_date: Optional[str] = None
    prerequisites: List[int] = Field(default_factory=list)


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ColumnStatus] = None
    position: Optional[int] = None
    due_date: Optional[str] = None
    prerequisites: Optional[List[int]] = None


class Item(BaseModel):
    id: int
    name: str
    description: str = ""
    status: ColumnStatus = "backlog"
    position: int = 0
    due_date: Optional[str] = None
    prerequisites: List[int] = Field(default_factory=list)


def parse_prerequisites_json(raw: Optional[str]) -> List[int]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    result: List[int] = []
    for value in data:
        try:
            result.append(int(value))
        except (TypeError, ValueError):
            continue
    return normalize_prerequisites(result)


def dump_prerequisites(prerequisites: List[int]) -> str:
    return json.dumps(normalize_prerequisites(prerequisites))

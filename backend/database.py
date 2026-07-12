import os
import sqlite3
from pathlib import Path
from typing import Optional

from models import dump_prerequisites, parse_prerequisites_json

DB_PATH = Path(
    os.environ.get(
        "SQLITE_PATH",
        Path(__file__).resolve().parent.parent / "items.db",
    )
)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _column_names(conn: sqlite3.Connection) -> set:
    return {
        row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()
    }


def _ensure_columns(conn: sqlite3.Connection) -> None:
    columns = _column_names(conn)
    if "status" not in columns:
        conn.execute(
            "ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'backlog'"
        )
    if "position" not in columns:
        conn.execute(
            "ALTER TABLE items ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
        )
        rows = conn.execute(
            "SELECT id, status FROM items ORDER BY status, id"
        ).fetchall()
        counters = {}
        for row in rows:
            status = row["status"] or "backlog"
            position = counters.get(status, 0)
            conn.execute(
                "UPDATE items SET position = ? WHERE id = ?",
                (position, row["id"]),
            )
            counters[status] = position + 1
    if "due_date" not in columns:
        conn.execute("ALTER TABLE items ADD COLUMN due_date TEXT")
    if "prerequisites" not in columns:
        conn.execute(
            "ALTER TABLE items ADD COLUMN prerequisites TEXT NOT NULL DEFAULT '[]'"
        )


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'backlog',
                position INTEGER NOT NULL DEFAULT 0,
                due_date TEXT,
                prerequisites TEXT NOT NULL DEFAULT '[]'
            )
            """
        )
        _ensure_columns(conn)
        count = conn.execute("SELECT COUNT(*) AS count FROM items").fetchone()["count"]
        if count == 0:
            conn.executemany(
                """
                INSERT INTO items (name, description, status, position, due_date, prerequisites)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    ("First item", "A sample item", "backlog", 0, None, "[]"),
                    ("Second item", "Another sample item", "todo", 0, None, "[]"),
                ],
            )
        conn.commit()


def next_position(conn: sqlite3.Connection, status: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(position), -1) AS max_position FROM items WHERE status = ?",
        (status,),
    ).fetchone()
    return int(row["max_position"]) + 1


def normalize_due_date(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def load_prerequisite_map(conn: sqlite3.Connection) -> dict:
    rows = conn.execute("SELECT id, prerequisites FROM items").fetchall()
    return {
        int(row["id"]): parse_prerequisites_json(row["prerequisites"]) for row in rows
    }


def load_status_map(conn: sqlite3.Connection) -> dict:
    rows = conn.execute("SELECT id, status FROM items").fetchall()
    return {
        int(row["id"]): (row["status"] or "backlog") for row in rows
    }


def remove_prerequisite_references(conn: sqlite3.Connection, item_id: int) -> None:
    rows = conn.execute("SELECT id, prerequisites FROM items").fetchall()
    for row in rows:
        prerequisites = parse_prerequisites_json(row["prerequisites"])
        if item_id not in prerequisites:
            continue
        updated = [prereq_id for prereq_id in prerequisites if prereq_id != item_id]
        conn.execute(
            "UPDATE items SET prerequisites = ? WHERE id = ?",
            (dump_prerequisites(updated), row["id"]),
        )


def row_to_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "status": row["status"] or "backlog",
        "position": int(row["position"] or 0),
        "due_date": row["due_date"] or None,
        "prerequisites": parse_prerequisites_json(row["prerequisites"]),
    }

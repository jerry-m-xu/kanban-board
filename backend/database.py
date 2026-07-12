import os
import sqlite3
from pathlib import Path

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


def _column_names(conn: sqlite3.Connection) -> set[str]:
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
        counters: dict[str, int] = {}
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
                due_date TEXT
            )
            """
        )
        _ensure_columns(conn)
        count = conn.execute("SELECT COUNT(*) AS count FROM items").fetchone()["count"]
        if count == 0:
            conn.executemany(
                """
                INSERT INTO items (name, description, status, position, due_date)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    ("First item", "A sample item", "backlog", 0, None),
                    ("Second item", "Another sample item", "todo", 0, None),
                ],
            )
        conn.commit()


def next_position(conn: sqlite3.Connection, status: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(position), -1) AS max_position FROM items WHERE status = ?",
        (status,),
    ).fetchone()
    return int(row["max_position"]) + 1


from typing import Optional


def normalize_due_date(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def row_to_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "status": row["status"] or "backlog",
        "position": int(row["position"] or 0),
        "due_date": row["due_date"] or None,
    }

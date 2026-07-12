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


def _ensure_status_column(conn: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()
    }
    if "status" not in columns:
        conn.execute(
            "ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'backlog'"
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
                status TEXT NOT NULL DEFAULT 'backlog'
            )
            """
        )
        _ensure_status_column(conn)
        count = conn.execute("SELECT COUNT(*) AS count FROM items").fetchone()["count"]
        if count == 0:
            conn.executemany(
                "INSERT INTO items (name, description, status) VALUES (?, ?, ?)",
                [
                    ("First item", "A sample item", "backlog"),
                    ("Second item", "Another sample item", "todo"),
                ],
            )
        conn.commit()


def row_to_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "status": row["status"] or "backlog",
    }

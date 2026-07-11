from pathlib import Path
import sqlite3

DB_PATH = Path(__file__).resolve().parent.parent / "items.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT ''
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) AS count FROM items").fetchone()["count"]
        if count == 0:
            conn.executemany(
                "INSERT INTO items (name, description) VALUES (?, ?)",
                [
                    ("First item", "A sample item"),
                    ("Second item", "Another sample item"),
                ],
            )
        conn.commit()


def row_to_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
    }

import os
import sqlite3
import uuid
from pathlib import Path
from typing import List, Optional

from models import dump_prerequisites, parse_prerequisites_json

DB_PATH = Path(
    os.environ.get(
        "SQLITE_PATH",
        Path(__file__).resolve().parent.parent / "items.db",
    )
)

UPLOAD_DIR = Path(
    os.environ.get(
        "UPLOAD_DIR",
        Path(__file__).resolve().parent.parent / "uploads",
    )
)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
}
ALLOWED_CONTENT_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


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
    if "user_id" not in columns:
        conn.execute("ALTER TABLE items ADD COLUMN user_id INTEGER")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_user_status_pos "
            "ON items(user_id, status, position)"
        )


def _ensure_attachments_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            content_type TEXT NOT NULL,
            kind TEXT NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        )
        """
    )


def _ensure_users_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_sub TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            picture TEXT
        )
        """
    )


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
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
        _ensure_attachments_table(conn)
        _ensure_users_table(conn)
        conn.commit()


def claim_orphan_items(conn: sqlite3.Connection, user_id: int) -> int:
    cursor = conn.execute(
        "UPDATE items SET user_id = ? WHERE user_id IS NULL",
        (user_id,),
    )
    return cursor.rowcount


def maybe_claim_orphan_items(conn: sqlite3.Connection, user_id: int) -> int:
    """Assign legacy cards (no owner) to the sole signed-in user."""
    user_count = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()[
        "count"
    ]
    if user_count != 1:
        return 0
    return claim_orphan_items(conn, user_id)


def get_owned_item(conn: sqlite3.Connection, item_id: int, user_id: int):
    return conn.execute(
        f"""
        SELECT id, name, description, status, position, due_date, prerequisites, user_id
        FROM items
        WHERE id = ? AND user_id = ?
        """,
        (item_id, user_id),
    ).fetchone()


def get_attachment_for_user(conn: sqlite3.Connection, attachment_id: int, user_id: int):
    return conn.execute(
        """
        SELECT a.id, a.item_id, a.filename, a.original_name, a.content_type, a.kind
        FROM attachments a
        JOIN items i ON i.id = a.item_id
        WHERE a.id = ? AND i.user_id = ?
        """,
        (attachment_id, user_id),
    ).fetchone()


def row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": int(row["id"]),
        "email": row["email"],
        "name": row["name"] or row["email"],
        "picture": row["picture"] or None,
    }


def get_user_by_id(conn: sqlite3.Connection, user_id: int):
    row = conn.execute(
        "SELECT id, google_sub, email, name, picture FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return row_to_user(row) if row else None


def get_or_create_user(
    conn: sqlite3.Connection,
    *,
    google_sub: str,
    email: str,
    name: str,
    picture: Optional[str],
) -> dict:
    row = conn.execute(
        "SELECT id, google_sub, email, name, picture FROM users WHERE google_sub = ?",
        (google_sub,),
    ).fetchone()
    if row is None:
        cursor = conn.execute(
            """
            INSERT INTO users (google_sub, email, name, picture)
            VALUES (?, ?, ?, ?)
            """,
            (google_sub, email, name, picture),
        )
        user_id = cursor.lastrowid
        maybe_claim_orphan_items(conn, user_id)
        conn.commit()
        return get_user_by_id(conn, user_id)

    user_id = int(row["id"])
    conn.execute(
        """
        UPDATE users
        SET email = ?, name = ?, picture = ?
        WHERE id = ?
        """,
        (email, name, picture, user_id),
    )
    maybe_claim_orphan_items(conn, user_id)
    conn.commit()
    return get_user_by_id(conn, user_id)


def next_position(conn: sqlite3.Connection, status: str, user_id: int) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(MAX(position), -1) AS max_position
        FROM items
        WHERE status = ? AND user_id = ?
        """,
        (status, user_id),
    ).fetchone()
    return int(row["max_position"]) + 1


def normalize_due_date(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def load_prerequisite_map(conn: sqlite3.Connection, user_id: int) -> dict:
    rows = conn.execute(
        "SELECT id, prerequisites FROM items WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    return {
        int(row["id"]): parse_prerequisites_json(row["prerequisites"]) for row in rows
    }


def load_status_map(conn: sqlite3.Connection, user_id: int) -> dict:
    rows = conn.execute(
        "SELECT id, status FROM items WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    return {
        int(row["id"]): (row["status"] or "backlog") for row in rows
    }


def remove_prerequisite_references(
    conn: sqlite3.Connection, item_id: int, user_id: int
) -> None:
    rows = conn.execute(
        "SELECT id, prerequisites FROM items WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    for row in rows:
        prerequisites = parse_prerequisites_json(row["prerequisites"])
        if item_id not in prerequisites:
            continue
        updated = [prereq_id for prereq_id in prerequisites if prereq_id != item_id]
        conn.execute(
            "UPDATE items SET prerequisites = ? WHERE id = ?",
            (dump_prerequisites(updated), row["id"]),
        )


def kind_for_content_type(content_type: str) -> Optional[str]:
    if content_type in ALLOWED_IMAGE_TYPES:
        return "image"
    if content_type in ALLOWED_VIDEO_TYPES:
        return "video"
    return None


def row_to_attachment(row: sqlite3.Row) -> dict:
    attachment_id = int(row["id"])
    return {
        "id": attachment_id,
        "item_id": int(row["item_id"]),
        "filename": row["filename"],
        "original_name": row["original_name"],
        "content_type": row["content_type"],
        "kind": row["kind"],
        "url": f"/api/attachments/{attachment_id}/file",
    }


def list_attachments_for_item(conn: sqlite3.Connection, item_id: int) -> List[dict]:
    rows = conn.execute(
        """
        SELECT id, item_id, filename, original_name, content_type, kind
        FROM attachments
        WHERE item_id = ?
        ORDER BY id
        """,
        (item_id,),
    ).fetchall()
    return [row_to_attachment(row) for row in rows]


def list_attachments_by_item_ids(conn: sqlite3.Connection, item_ids: List[int]) -> dict:
    if not item_ids:
        return {}
    placeholders = ",".join("?" for _ in item_ids)
    rows = conn.execute(
        f"""
        SELECT id, item_id, filename, original_name, content_type, kind
        FROM attachments
        WHERE item_id IN ({placeholders})
        ORDER BY id
        """,
        item_ids,
    ).fetchall()
    grouped = {item_id: [] for item_id in item_ids}
    for row in rows:
        grouped[int(row["item_id"])].append(row_to_attachment(row))
    return grouped


def get_attachment(conn: sqlite3.Connection, attachment_id: int):
    return conn.execute(
        """
        SELECT id, item_id, filename, original_name, content_type, kind
        FROM attachments
        WHERE id = ?
        """,
        (attachment_id,),
    ).fetchone()


def create_attachment(
    conn: sqlite3.Connection,
    item_id: int,
    filename: str,
    original_name: str,
    content_type: str,
    kind: str,
) -> dict:
    cursor = conn.execute(
        """
        INSERT INTO attachments (item_id, filename, original_name, content_type, kind)
        VALUES (?, ?, ?, ?, ?)
        """,
        (item_id, filename, original_name, content_type, kind),
    )
    conn.commit()
    row = get_attachment(conn, cursor.lastrowid)
    return row_to_attachment(row)


def delete_attachment_files(filenames: List[str]) -> None:
    for filename in filenames:
        path = UPLOAD_DIR / filename
        if path.is_file():
            path.unlink()


def delete_attachments_for_item(conn: sqlite3.Connection, item_id: int) -> None:
    rows = conn.execute(
        "SELECT filename FROM attachments WHERE item_id = ?",
        (item_id,),
    ).fetchall()
    filenames = [row["filename"] for row in rows]
    conn.execute("DELETE FROM attachments WHERE item_id = ?", (item_id,))
    delete_attachment_files(filenames)


def unique_stored_filename(original_name: str) -> str:
    suffix = Path(original_name).suffix.lower()
    return f"{uuid.uuid4().hex}{suffix}"


def row_to_item(row: sqlite3.Row, attachments: Optional[List[dict]] = None) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "status": row["status"] or "backlog",
        "position": int(row["position"] or 0),
        "due_date": row["due_date"] or None,
        "prerequisites": parse_prerequisites_json(row["prerequisites"]),
        "attachments": attachments if attachments is not None else [],
    }

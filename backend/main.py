from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from database import get_connection, init_db, next_position, normalize_due_date, row_to_item
from models import Item, ItemCreate, ItemUpdate, due_date_allowed_for_status

app = FastAPI(title="REST API")

DIST_PATH = Path(__file__).resolve().parent.parent / "frontend" / "dist"
ITEM_COLUMNS = "id, name, description, status, position, due_date"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/items", response_model=List[Item])
def list_items():
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items ORDER BY status, position, id"
        ).fetchall()
    return [row_to_item(row) for row in rows]


@app.get("/api/items/{item_id}", response_model=Item)
def get_item(item_id: int):
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return row_to_item(row)


@app.post("/api/items", response_model=Item, status_code=201)
def create_item(payload: ItemCreate):
    due_date = normalize_due_date(payload.due_date)
    error = due_date_allowed_for_status(payload.status, due_date)
    if error:
        raise HTTPException(status_code=400, detail=error)

    with get_connection() as conn:
        position = next_position(conn, payload.status)
        cursor = conn.execute(
            """
            INSERT INTO items (name, description, status, position, due_date)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.name, payload.description, payload.status, position, due_date),
        )
        conn.commit()
        item_id = cursor.lastrowid
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return row_to_item(row)


@app.put("/api/items/{item_id}", response_model=Item)
def update_item(item_id: int, payload: ItemUpdate):
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")

        if payload.name is not None and payload.name == "":
            raise HTTPException(status_code=400, detail="name must be a string")

        name = payload.name if payload.name is not None else row["name"]
        description = (
            payload.description
            if payload.description is not None
            else row["description"]
        )
        status = payload.status if payload.status is not None else row["status"]
        position = (
            payload.position if payload.position is not None else row["position"]
        )
        due_date = (
            normalize_due_date(payload.due_date)
            if payload.due_date is not None
            else row["due_date"]
        )

        status_changed = status != row["status"]
        due_changed = due_date != row["due_date"]
        if status_changed or due_changed:
            error = due_date_allowed_for_status(status, due_date)
            if error:
                raise HTTPException(status_code=400, detail=error)

        conn.execute(
            """
            UPDATE items
            SET name = ?, description = ?, status = ?, position = ?, due_date = ?
            WHERE id = ?
            """,
            (name, description, status, position, due_date, item_id),
        )
        conn.commit()
        updated = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return row_to_item(updated)


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Item not found")


if DIST_PATH.exists():
    assets_dir = DIST_PATH / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(str(DIST_PATH / "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = DIST_PATH / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(DIST_PATH / "index.html"))

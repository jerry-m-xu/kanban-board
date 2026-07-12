from typing import List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from database import (
    MAX_UPLOAD_BYTES,
    UPLOAD_DIR,
    create_attachment,
    delete_attachment_files,
    delete_attachments_for_item,
    get_attachment,
    get_connection,
    init_db,
    kind_for_content_type,
    list_attachments_by_item_ids,
    list_attachments_for_item,
    load_prerequisite_map,
    load_status_map,
    next_position,
    normalize_due_date,
    remove_prerequisite_references,
    row_to_item,
    unique_stored_filename,
)
from models import (
    Attachment,
    Item,
    ItemCreate,
    ItemUpdate,
    dump_prerequisites,
    due_date_allowed_for_status,
    normalize_prerequisites,
    validate_prerequisites,
    validate_status_move_for_prerequisites,
)

app = FastAPI(title="REST API")

DIST_PATH = Path(__file__).resolve().parent.parent / "frontend" / "dist"
ITEM_COLUMNS = "id, name, description, status, position, due_date, prerequisites"

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


def hydrate_items(conn, rows) -> List[dict]:
    item_ids = [int(row["id"]) for row in rows]
    attachments_by_item = list_attachments_by_item_ids(conn, item_ids)
    return [
        row_to_item(row, attachments_by_item.get(int(row["id"]), [])) for row in rows
    ]


@app.get("/api/items", response_model=List[Item])
def list_items():
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items ORDER BY status, position, id"
        ).fetchall()
        return hydrate_items(conn, rows)


@app.get("/api/items/{item_id}", response_model=Item)
def get_item(item_id: int):
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        return row_to_item(row, list_attachments_for_item(conn, item_id))


@app.post("/api/items", response_model=Item, status_code=201)
def create_item(payload: ItemCreate):
    due_date = normalize_due_date(payload.due_date)
    error = due_date_allowed_for_status(payload.status, due_date)
    if error:
        raise HTTPException(status_code=400, detail=error)

    prerequisites = normalize_prerequisites(payload.prerequisites)

    with get_connection() as conn:
        prereq_map = load_prerequisite_map(conn)
        status_map = load_status_map(conn)
        prereq_error = validate_prerequisites(
            None, payload.status, prerequisites, prereq_map, status_map
        )
        if prereq_error:
            raise HTTPException(status_code=400, detail=prereq_error)

        position = next_position(conn, payload.status)
        cursor = conn.execute(
            """
            INSERT INTO items
                (name, description, status, position, due_date, prerequisites)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name,
                payload.description,
                payload.status,
                position,
                due_date,
                dump_prerequisites(prerequisites),
            ),
        )
        conn.commit()
        item_id = cursor.lastrowid
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        return row_to_item(row, [])


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
        current_item = row_to_item(row)
        prerequisites = (
            normalize_prerequisites(payload.prerequisites)
            if payload.prerequisites is not None
            else current_item["prerequisites"]
        )

        status_changed = status != row["status"]
        due_changed = due_date != row["due_date"]
        if status_changed or due_changed:
            error = due_date_allowed_for_status(status, due_date)
            if error:
                raise HTTPException(status_code=400, detail=error)

        prereq_map = load_prerequisite_map(conn)
        status_map = load_status_map(conn)

        if payload.prerequisites is not None:
            prereq_error = validate_prerequisites(
                item_id, status, prerequisites, prereq_map, status_map
            )
            if prereq_error:
                raise HTTPException(status_code=400, detail=prereq_error)

        if status_changed:
            move_error = validate_status_move_for_prerequisites(
                item_id, status, prerequisites, prereq_map, status_map
            )
            if move_error:
                raise HTTPException(status_code=400, detail=move_error)

        conn.execute(
            """
            UPDATE items
            SET name = ?, description = ?, status = ?, position = ?,
                due_date = ?, prerequisites = ?
            WHERE id = ?
            """,
            (
                name,
                description,
                status,
                position,
                due_date,
                dump_prerequisites(prerequisites),
                item_id,
            ),
        )
        conn.commit()
        updated = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        return row_to_item(updated, list_attachments_for_item(conn, item_id))


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        delete_attachments_for_item(conn, item_id)
        conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        remove_prerequisite_references(conn, item_id)
        conn.commit()


@app.post(
    "/api/items/{item_id}/attachments",
    response_model=Attachment,
    status_code=201,
)
async def upload_attachment(item_id: int, file: UploadFile = File(...)):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    kind = kind_for_content_type(content_type)
    if kind is None:
        raise HTTPException(
            status_code=400,
            detail="Only image (jpeg, png, gif, webp) and video (mp4, webm, mov) files are allowed",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail="File is too large (max 50MB)",
        )

    original_name = Path(file.filename or f"upload.{kind}").name
    stored_name = unique_stored_filename(original_name)
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(data)

    with get_connection() as conn:
        return create_attachment(
            conn,
            item_id=item_id,
            filename=stored_name,
            original_name=original_name,
            content_type=content_type,
            kind=kind,
        )


@app.get("/api/attachments/{attachment_id}/file")
def download_attachment(attachment_id: int):
    with get_connection() as conn:
        row = get_attachment(conn, attachment_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Attachment not found")
        path = UPLOAD_DIR / row["filename"]
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Attachment file missing")
        return FileResponse(
            path,
            media_type=row["content_type"],
            filename=row["original_name"],
            content_disposition_type="inline",
        )


@app.delete("/api/attachments/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int):
    with get_connection() as conn:
        row = get_attachment(conn, attachment_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Attachment not found")
        filename = row["filename"]
        conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
        conn.commit()
    delete_attachment_files([filename])


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

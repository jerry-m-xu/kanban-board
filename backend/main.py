from typing import List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from auth import (
    GOOGLE_CLIENT_ID,
    AuthResponse,
    AuthUser,
    GoogleAuthRequest,
    authenticate_with_google,
    bearer_scheme,
    require_user,
    user_from_access_token,
)
from database import (
    MAX_UPLOAD_BYTES,
    UPLOAD_DIR,
    create_attachment,
    delete_attachment_files,
    delete_attachments_for_item,
    get_attachment_for_user,
    get_connection,
    get_owned_item,
    init_db,
    kind_for_content_type,
    list_attachments_by_item_ids,
    list_attachments_for_item,
    load_prerequisite_map,
    load_status_map,
    maybe_claim_orphan_items,
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


@app.get("/api/auth/config")
def auth_config():
    return {
        "googleClientId": GOOGLE_CLIENT_ID or None,
        "googleEnabled": bool(GOOGLE_CLIENT_ID),
    }


@app.post("/api/auth/google", response_model=AuthResponse)
def auth_google(payload: GoogleAuthRequest):
    return authenticate_with_google(payload.credential)


@app.get("/api/auth/me", response_model=AuthUser)
def auth_me(user: dict = Depends(require_user)):
    return AuthUser(**user)


def hydrate_items(conn, rows) -> List[dict]:
    item_ids = [int(row["id"]) for row in rows]
    attachments_by_item = list_attachments_by_item_ids(conn, item_ids)
    return [
        row_to_item(row, attachments_by_item.get(int(row["id"]), [])) for row in rows
    ]


@app.get("/api/items", response_model=List[Item])
def list_items(user: dict = Depends(require_user)):
    with get_connection() as conn:
        if maybe_claim_orphan_items(conn, user["id"]):
            conn.commit()
        rows = conn.execute(
            f"""
            SELECT {ITEM_COLUMNS}
            FROM items
            WHERE user_id = ?
            ORDER BY status, position, id
            """,
            (user["id"],),
        ).fetchall()
        return hydrate_items(conn, rows)


@app.get("/api/items/{item_id}", response_model=Item)
def get_item(item_id: int, user: dict = Depends(require_user)):
    with get_connection() as conn:
        row = get_owned_item(conn, item_id, user["id"])
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        return row_to_item(row, list_attachments_for_item(conn, item_id))


@app.post("/api/items", response_model=Item, status_code=201)
def create_item(payload: ItemCreate, user: dict = Depends(require_user)):
    due_date = normalize_due_date(payload.due_date)
    error = due_date_allowed_for_status(payload.status, due_date)
    if error:
        raise HTTPException(status_code=400, detail=error)

    prerequisites = normalize_prerequisites(payload.prerequisites)
    user_id = user["id"]

    with get_connection() as conn:
        prereq_map = load_prerequisite_map(conn, user_id)
        status_map = load_status_map(conn, user_id)
        prereq_error = validate_prerequisites(
            None, payload.status, prerequisites, prereq_map, status_map
        )
        if prereq_error:
            raise HTTPException(status_code=400, detail=prereq_error)

        position = next_position(conn, payload.status, user_id)
        cursor = conn.execute(
            """
            INSERT INTO items
                (name, description, status, position, due_date, prerequisites, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name,
                payload.description,
                payload.status,
                position,
                due_date,
                dump_prerequisites(prerequisites),
                user_id,
            ),
        )
        conn.commit()
        item_id = cursor.lastrowid
        row = get_owned_item(conn, item_id, user_id)
        return row_to_item(row, [])


@app.put("/api/items/{item_id}", response_model=Item)
def update_item(
    item_id: int, payload: ItemUpdate, user: dict = Depends(require_user)
):
    user_id = user["id"]
    with get_connection() as conn:
        row = get_owned_item(conn, item_id, user_id)
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

        prereq_map = load_prerequisite_map(conn, user_id)
        status_map = load_status_map(conn, user_id)

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
            WHERE id = ? AND user_id = ?
            """,
            (
                name,
                description,
                status,
                position,
                due_date,
                dump_prerequisites(prerequisites),
                item_id,
                user_id,
            ),
        )
        conn.commit()
        updated = get_owned_item(conn, item_id, user_id)
        return row_to_item(updated, list_attachments_for_item(conn, item_id))


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int, user: dict = Depends(require_user)):
    user_id = user["id"]
    with get_connection() as conn:
        row = get_owned_item(conn, item_id, user_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        delete_attachments_for_item(conn, item_id)
        conn.execute(
            "DELETE FROM items WHERE id = ? AND user_id = ?",
            (item_id, user_id),
        )
        remove_prerequisite_references(conn, item_id, user_id)
        conn.commit()


@app.post(
    "/api/items/{item_id}/attachments",
    response_model=Attachment,
    status_code=201,
)
async def upload_attachment(
    item_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    with get_connection() as conn:
        row = get_owned_item(conn, item_id, user["id"])
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
def download_attachment(
    attachment_id: int,
    token: Optional[str] = Query(None),
    credentials=Depends(bearer_scheme),
):
    user = None
    if credentials is not None and credentials.scheme.lower() == "bearer":
        user = user_from_access_token(credentials.credentials)
    if user is None and token:
        user = user_from_access_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with get_connection() as conn:
        row = get_attachment_for_user(conn, attachment_id, user["id"])
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
def delete_attachment(
    attachment_id: int, user: dict = Depends(require_user)
):
    with get_connection() as conn:
        row = get_attachment_for_user(conn, attachment_id, user["id"])
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

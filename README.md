# Kanban Board

A Kanban board with a **React** (Vite) frontend and a **FastAPI** + SQLite backend.

Cards live in four columns: **Backlog**, **To-do**, **In Progress**, and **Done**. Create, edit, and delete cards through the UI (or the REST API).

## Setup

```bash
# Python API (use a Python 3.9+ install with SSL, e.g. Homebrew)
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# React frontend
npm install --prefix frontend
```

## Development

Run the API and React UI in two terminals:

```bash
# Terminal 1 — API (http://localhost:3000)
source .venv/bin/activate
uvicorn main:app --reload --app-dir backend --port 3000

# Terminal 2 — React UI (http://localhost:5173)
npm run dev --prefix frontend
```

Vite proxies `/api` requests to the FastAPI server on port 3000.

Interactive API docs: http://localhost:3000/docs

## Production

Build the React app, then start FastAPI (it serves `frontend/dist`):

```bash
npm run build --prefix frontend
source .venv/bin/activate
uvicorn main:app --app-dir backend --port 3000
```

Open `http://localhost:3000`.

Data is stored in `items.db` (SQLite). The file is created automatically on first run. Existing databases get a `status` column added on startup if needed.

## Docker

Requires Docker Desktop running.

There are two Dockerfiles:
- `backend/Dockerfile` — FastAPI / Uvicorn
- `frontend/Dockerfile` — Vite (dev) or nginx (production)

```bash
# Production — backend + frontend containers
docker compose --profile app up --build
# open http://localhost:3000

# Dev — API reload + Vite HMR (two containers)
docker compose --profile app-dev up --build
# UI: http://localhost:5173  API: http://localhost:3000

# Dev + debugger
docker compose --profile app-dev-debug up --build
# then: Run and Debug → "Attach to Docker" → F5
```

| Profile | Containers | Notes |
|---------|------------|--------|
| `app` | `backend`, `frontend` | Production; UI on **:3000** |
| `app-dev` | `backend-dev`, `frontend-dev` | Mounts + reload; UI on **:5173** |
| `app-dev-debug` | `backend-dev-debug`, `frontend-dev` | Same as dev + debugpy **:5678** |

Each mode is a separate profile so they don’t all start at once (and fight over port 3000).

```bash
docker compose --profile app --profile app-dev --profile app-dev-debug down --remove-orphans
```

After a backend reload while debugging, re-attach if breakpoints stop working.

## Card model

| Field | Type | Notes |
|-------|------|--------|
| `id` | integer | Auto-generated |
| `name` | string | Required |
| `description` | string | Optional |
| `status` | string | One of `backlog`, `todo`, `in-progress`, `done` (default: `backlog`) |
| `position` | integer | Order within the column (0-based) |
| `due_date` | string | Required ISO date (`YYYY-MM-DD`). **Backlog** / **Done**: today or earlier. **To-do** / **In Progress**: today or later. |
| `prerequisites` | list of ints | IDs of prerequisite cards (default `[]`). Cycles are rejected. **Done** cards may only depend on other **Done** cards. |
| `attachments` | list | Image/video files attached to the card |

Attachments are stored under `uploads/` (or `UPLOAD_DIR`) and served at `/api/attachments/{id}/file`. Allowed types: jpeg, png, gif, webp, mp4, webm, mov (max 50MB).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/items` | List all cards |
| GET | `/api/items/{id}` | Get one card |
| POST | `/api/items` | Create a card |
| PUT | `/api/items/{id}` | Update a card |
| DELETE | `/api/items/{id}` | Delete a card |
| POST | `/api/items/{id}/attachments` | Upload an image or video |
| GET | `/api/attachments/{id}/file` | Download/view an attachment |
| DELETE | `/api/attachments/{id}` | Delete an attachment |

## Examples

```bash
# List cards
curl http://localhost:3000/api/items

# Create a card in To-do
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Ship kanban UI", "description": "Four columns", "status": "todo", "due_date": "2026-07-20"}'

# Move a card to In Progress
curl -X PUT http://localhost:3000/api/items/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress"}'

# Delete a card
curl -X DELETE http://localhost:3000/api/items/1
```

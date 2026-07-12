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

## Google sign-in

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (type **Web application**).
2. Add authorized JavaScript origins, e.g. `http://localhost:5173` (and `http://localhost:3000` if you use production Docker).
3. Copy `.env.example` → `.env` and `frontend/.env.example` → `frontend/.env`, then set the same client ID in both:

```bash
# .env (backend)
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
JWT_SECRET=some-long-random-string

# frontend/.env
VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
```

4. Restart the API and Vite dev server. The toolbar shows **Sign in with Google**; after sign-in you’ll see your avatar and a **Sign out** button.

Card ownership per Google account is the next step — for now sign-in establishes a user session (JWT) while the board still uses the shared item list.

## Development

Run the API and React UI in two terminals:

```bash
# Terminal 1 — API (http://localhost:3000)
source .venv/bin/activate
# optional: export GOOGLE_CLIENT_ID=... JWT_SECRET=...
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
| `user_id` | integer | Owner (set from the signed-in user; not exposed in the JSON response) |

Cards are **per user**: item and attachment routes require a Bearer JWT. Each signed-in account only sees and edits its own board. Legacy cards without an owner are claimed by the first (sole) user on sign-in.

Attachments are stored under `uploads/` (or `UPLOAD_DIR`) and served at `/api/attachments/{id}/file`. Allowed types: jpeg, png, gif, webp, mp4, webm, mov (max 50MB).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/auth/config` | Public Google client config |
| POST | `/api/auth/google` | Exchange Google ID token for app JWT |
| GET | `/api/auth/me` | Current signed-in user |
| GET | `/api/items` | List the current user’s cards |
| GET | `/api/items/{id}` | Get one of the current user’s cards |
| POST | `/api/items` | Create a card for the current user |
| PUT | `/api/items/{id}` | Update one of the current user’s cards |
| DELETE | `/api/items/{id}` | Delete one of the current user’s cards |
| POST | `/api/items/{id}/attachments` | Upload an image or video |
| GET | `/api/attachments/{id}/file` | Download/view an attachment (`Authorization` or `?token=`) |
| DELETE | `/api/attachments/{id}` | Delete an attachment |

## Examples

```bash
# List cards (replace TOKEN with the JWT from Google sign-in)
curl http://localhost:3000/api/items \
  -H "Authorization: Bearer TOKEN"

# Create a card in To-do
curl -X POST http://localhost:3000/api/items \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Ship kanban UI", "description": "Four columns", "status": "todo", "due_date": "2026-07-20"}'

# Move a card to In Progress
curl -X PUT http://localhost:3000/api/items/1 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress"}'

# Delete a card
curl -X DELETE http://localhost:3000/api/items/1 \
  -H "Authorization: Bearer TOKEN"
```

# REST API

A REST API built with **FastAPI** (Python) and SQLite, plus a React (Vite) frontend.

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

Data is stored in `items.db` (SQLite). The file is created automatically on first run.

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

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/items` | List all items |
| GET | `/api/items/{id}` | Get one item |
| POST | `/api/items` | Create an item |
| PUT | `/api/items/{id}` | Update an item |
| DELETE | `/api/items/{id}` | Delete an item |

## Examples

```bash
# List items
curl http://localhost:3000/api/items

# Create an item
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name": "New item", "description": "Optional description"}'

# Update an item
curl -X PUT http://localhost:3000/api/items/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated name"}'

# Delete an item
curl -X DELETE http://localhost:3000/api/items/1
```

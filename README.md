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

```bash
# Production-style (built image, no source mount)
docker compose up --build
# same as: docker compose up app --build

# Dev — mount backend + auto-reload
docker compose up app-dev --build

# Dev + debug — reload and debugger (attach on port 5678)
docker compose up app-dev-debug --build
# then: Run and Debug → "Attach to Docker" → F5
```

Open `http://localhost:3000`.

SQLite data is kept in a Docker volume (`sqlite_data`), so it persists across container restarts.

```bash
docker compose down          # stop
docker compose up --build -d # rebuild and run app in background
```

| Service | Command | Behavior |
|---------|---------|----------|
| `app` | `docker compose up --build` | Built image, no reload |
| `app-dev` | `docker compose up app-dev --build` | Mount `backend/`, `--reload` |
| `app-dev-debug` | `docker compose up app-dev-debug --build` | Mount `backend/`, `--reload` **and** debugpy on `:5678` |

Run **one** of these at a time (they all use port 3000).

`app-dev-debug` does both reload and debugging. After a code reload, breakpoints can get flaky — detach/reattach **Attach to Docker** if they stop hitting.

**Frontend note:** the container serves built React files (`frontend/dist`), not JSX source. For live UI edits:

```bash
# Terminal A
docker compose up app-dev --build

# Terminal B
npm run dev --prefix frontend
```

Or rebuild the image after UI changes: `docker compose up --build`.

For debug mode, set breakpoints in `backend/`, attach with **Attach to Docker**, then hit the API/UI.

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

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
docker compose up --build
```

Then open `http://localhost:3000`.

SQLite data is kept in a Docker volume (`sqlite_data`), so it persists across container restarts.

```bash
docker compose down          # stop
docker compose up --build -d # rebuild and run in background
```

### Live code reload (backend)

Mount your local `backend/` folder into the container and enable `--reload`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Edits under `backend/` are visible immediately; Uvicorn restarts on change.

**Frontend note:** the container serves the **built** React files (`frontend/dist`), not the JSX source. For live UI edits, either:

```bash
# Terminal A — API in Docker with backend mount
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Terminal B — React with Vite hot reload
npm run dev --prefix frontend
```

Or rebuild the UI into the image when you change it:

```bash
docker compose up --build
```

### Debug in Docker (breakpoints)

1. Rebuild once (adds `debugpy`), then start waiting for the debugger:

```bash
docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build
```

The container will pause until you attach.

2. In Cursor: **Run and Debug** → choose **Attach to Docker** → press **F5**.

3. Set breakpoints in `backend/` (e.g. in `create_item`), then call the API or use the UI.

`--reload` is off in debug mode because it conflicts with breakpoints.

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

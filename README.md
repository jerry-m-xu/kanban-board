# REST API

A REST API built with Node.js, Express, and SQLite, plus a React (Vite) frontend.

## Setup

```bash
npm run install:all
```

## Development

Run the API and React UI in two terminals:

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — React UI (http://localhost:5173)
npm run dev:frontend
```

Vite proxies `/api` requests to the Express server on port 3000.

## Production

Build the React app, then start Express (it serves `frontend/dist`):

```bash
npm run build
npm start
```

Open `http://localhost:3000`.

Data is stored in `items.db` (SQLite). The file is created automatically on first run.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/items` | List all items |
| GET | `/api/items/:id` | Get one item |
| POST | `/api/items` | Create an item |
| PUT | `/api/items/:id` | Update an item |
| DELETE | `/api/items/:id` | Delete an item |

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

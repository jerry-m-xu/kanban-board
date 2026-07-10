# REST API

A simple REST API built with Node.js, Express, and SQLite.

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The server runs at `http://localhost:3000` by default. Set `PORT` to change it.

Open `http://localhost:3000` in your browser for the web UI.

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

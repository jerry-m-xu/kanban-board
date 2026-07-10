const db = require("./db");

function getAll() {
  return db.prepare("SELECT id, name, description FROM items").all();
}

function getById(id) {
  return db
    .prepare("SELECT id, name, description FROM items WHERE id = ?")
    .get(id);
}

function create({ name, description = "" }) {
  const result = db
    .prepare("INSERT INTO items (name, description) VALUES (?, ?)")
    .run(name, description);
  return getById(result.lastInsertRowid);
}

function update(id, { name, description }) {
  const item = getById(id);
  if (!item) return null;

  db.prepare("UPDATE items SET name = ?, description = ? WHERE id = ?").run(
    name ?? item.name,
    description ?? item.description,
    id
  );

  return getById(id);
}

function remove(id) {
  const result = db.prepare("DELETE FROM items WHERE id = ?").run(id);
  return result.changes > 0;
}

module.exports = { getAll, getById, create, update, remove };

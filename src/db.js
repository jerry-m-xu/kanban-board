const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "items.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT ''
  )
`);

const count = db.prepare("SELECT COUNT(*) AS count FROM items").get().count;
if (count === 0) {
  const insert = db.prepare(
    "INSERT INTO items (name, description) VALUES (?, ?)"
  );
  insert.run("First item", "A sample item");
  insert.run("Second item", "Another sample item");
}

module.exports = db;

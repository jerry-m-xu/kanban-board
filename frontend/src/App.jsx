import { useEffect, useState } from "react";
import { api } from "./api";
import "./App.css";

const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To-do" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

const emptyForm = { name: "", description: "", status: "backlog" };

export default function App() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  function showStatus(message, isError = false) {
    setStatus(message);
    setError(isError);
  }

  async function loadItems() {
    showStatus("Loading...");
    try {
      const data = await api();
      setItems(data);
      showStatus(`${data.length} item(s)`);
    } catch (err) {
      showStatus(err.message, true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      status: item.status || "backlog",
    });
    showStatus("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    showStatus("Saving...");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
    };

    try {
      if (editingId) {
        await api(`/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showStatus("Item updated");
      } else {
        await api("", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showStatus("Item created");
      }
      resetForm();
      await loadItems();
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this item?")) return;

    showStatus("Deleting...");
    try {
      await api(`/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      showStatus("Item deleted");
      await loadItems();
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  function itemsForColumn(columnId) {
    return items.filter((item) => (item.status || "backlog") === columnId);
  }

  return (
    <main>
      <h1>Kanban Board</h1>

      <section className="form-section">
        <h2>{editingId ? "Edit item" : "Add item"}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Description
            <input
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label>
            Column
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {COLUMNS.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="submit">{editingId ? "Update" : "Create"}</button>
            {editingId && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  resetForm();
                  showStatus("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <p className={`status${error ? " error" : ""}`}>{status}</p>

      {loading ? (
        <p className="empty">Loading...</p>
      ) : (
        <div className="board">
          {COLUMNS.map((column) => {
            const columnItems = itemsForColumn(column.id);
            return (
              <section key={column.id} className="column">
                <header className="column-header">
                  <h2>{column.label}</h2>
                  <span className="column-count">{columnItems.length}</span>
                </header>
                {columnItems.length === 0 ? (
                  <p className="empty">No items</p>
                ) : (
                  <ul className="item-list">
                    {columnItems.map((item) => (
                      <li key={item.id} className="item">
                        <div className="item-info">
                          <strong>{item.name}</strong>
                          <span>{item.description || "No description"}</span>
                        </div>
                        <div className="item-actions">
                          <button
                            type="button"
                            className="small"
                            onClick={() => startEdit(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="small danger"
                            onClick={() => handleDelete(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

import { useEffect, useState } from "react";
import { api } from "./api";
import "./App.css";

const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To-do" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

const emptyForm = { name: "", description: "" };

export default function App() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [addingColumn, setAddingColumn] = useState(null);
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
    setAddingColumn(null);
    setEditingId(null);
  }

  function openAddForm(columnId) {
    setEditingId(null);
    setAddingColumn(columnId);
    setForm(emptyForm);
    showStatus("");
  }

  function startEdit(item) {
    setAddingColumn(null);
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
    });
    showStatus("");
  }

  async function handleCreate(e, columnId) {
    e.preventDefault();
    showStatus("Saving...");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: columnId,
    };

    try {
      await api("", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showStatus("Item created");
      resetForm();
      await loadItems();
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  async function handleUpdate(e, item) {
    e.preventDefault();
    showStatus("Saving...");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: item.status || "backlog",
    };

    try {
      await api(`/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showStatus("Item updated");
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

  function renderItemForm({ onSubmit, submitLabel }) {
    return (
      <form className="item-form" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          autoFocus
        />
        <input
          type="text"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="form-actions">
          <button type="submit" className="small">
            {submitLabel}
          </button>
          <button
            type="button"
            className="small secondary"
            onClick={() => {
              resetForm();
              showStatus("");
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <main>
      <h1>Kanban Board</h1>

      <p className={`status${error ? " error" : ""}`}>{status}</p>

      {loading ? (
        <p className="empty">Loading...</p>
      ) : (
        <div className="board">
          {COLUMNS.map((column) => {
            const columnItems = itemsForColumn(column.id);
            const isAdding = addingColumn === column.id;

            return (
              <section key={column.id} className="column">
                <header className="column-header">
                  <div className="column-title">
                    <h2>{column.label}</h2>
                    <span className="column-count">{columnItems.length}</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Add item to ${column.label}`}
                    title="Add item"
                    onClick={() =>
                      isAdding ? resetForm() : openAddForm(column.id)
                    }
                  >
                    {isAdding ? "×" : "+"}
                  </button>
                </header>

                <ul className="item-list">
                  {isAdding && (
                    <li className="item item-form-card">
                      {renderItemForm({
                        onSubmit: (e) => handleCreate(e, column.id),
                        submitLabel: "Add",
                      })}
                    </li>
                  )}

                  {columnItems.map((item) => (
                    <li key={item.id} className="item">
                      {editingId === item.id ? (
                        renderItemForm({
                          onSubmit: (e) => handleUpdate(e, item),
                          submitLabel: "Save",
                        })
                      ) : (
                        <>
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
                        </>
                      )}
                    </li>
                  ))}
                </ul>

                {!isAdding && columnItems.length === 0 && (
                  <p className="empty">No items</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

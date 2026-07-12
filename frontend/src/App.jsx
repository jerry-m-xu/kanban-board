import { useEffect, useRef, useState } from "react";
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
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const draggedRef = useRef(false);

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

  function resetAddForm() {
    setForm(emptyForm);
    setAddingColumn(null);
  }

  function clearEditing() {
    setEditing(null);
    setDraft("");
  }

  function openAddForm(columnId) {
    clearEditing();
    setAddingColumn(columnId);
    setForm(emptyForm);
    showStatus("");
  }

  function startFieldEdit(item, field) {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setAddingColumn(null);
    setEditing({ id: item.id, field });
    setDraft(field === "name" ? item.name : item.description || "");
    showStatus("");
  }

  async function saveFieldEdit(item) {
    if (!editing || editing.id !== item.id) return;

    const field = editing.field;
    const nextValue = draft.trim();
    const previous =
      field === "name" ? item.name : item.description || "";

    if (field === "name" && !nextValue) {
      showStatus("Name is required", true);
      setDraft(item.name);
      clearEditing();
      return;
    }

    if (nextValue === previous) {
      clearEditing();
      return;
    }

    const payload =
      field === "name"
        ? { name: nextValue }
        : { description: nextValue };

    const previousItems = items;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, ...payload } : entry
      )
    );
    clearEditing();
    showStatus("Saving...");

    try {
      await api(`/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showStatus("Item updated");
    } catch (err) {
      setItems(previousItems);
      showStatus(err.message, true);
    }
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
      resetAddForm();
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
      if (editing?.id === id) clearEditing();
      showStatus("Item deleted");
      await loadItems();
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  async function moveItem(itemId, nextStatus) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    const currentStatus = item.status || "backlog";
    if (currentStatus === nextStatus) return;

    const previousItems = items;
    setItems((current) =>
      current.map((entry) =>
        entry.id === itemId ? { ...entry, status: nextStatus } : entry
      )
    );
    showStatus("Moving...");

    try {
      await api(`/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      showStatus("Item moved");
    } catch (err) {
      setItems(previousItems);
      showStatus(err.message, true);
    }
  }

  function handleDragStart(e, item) {
    if (editing?.id === item.id) {
      e.preventDefault();
      return;
    }
    draggedRef.current = false;
    setDraggingId(item.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(item.id));
  }

  function handleDragEnd() {
    draggedRef.current = true;
    setDraggingId(null);
    setDragOverColumn(null);
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }

  function handleColumnDragOver(e, columnId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  }

  function handleColumnDragLeave(e, columnId) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn((current) => (current === columnId ? null : current));
    }
  }

  async function handleColumnDrop(e, columnId) {
    e.preventDefault();
    const rawId = e.dataTransfer.getData("text/plain");
    const itemId = Number(rawId);
    setDraggingId(null);
    setDragOverColumn(null);
    if (!Number.isFinite(itemId)) return;
    await moveItem(itemId, columnId);
  }

  function itemsForColumn(columnId) {
    return items.filter((item) => (item.status || "backlog") === columnId);
  }

  function renderAddForm(columnId) {
    return (
      <form className="item-form" onSubmit={(e) => handleCreate(e, columnId)}>
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
            Add
          </button>
          <button
            type="button"
            className="small secondary"
            onClick={() => {
              resetAddForm();
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
            const isDropTarget = dragOverColumn === column.id;

            return (
              <section
                key={column.id}
                className={`column column-${column.id}${
                  isDropTarget ? " column-drop-target" : ""
                }`}
                onDragOver={(e) => handleColumnDragOver(e, column.id)}
                onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
                onDrop={(e) => handleColumnDrop(e, column.id)}
              >
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
                      isAdding ? resetAddForm() : openAddForm(column.id)
                    }
                  >
                    {isAdding ? "×" : "+"}
                  </button>
                </header>

                <ul className="item-list">
                  {isAdding && (
                    <li className="item item-form-card">
                      {renderAddForm(column.id)}
                    </li>
                  )}

                  {columnItems.map((item) => {
                    const editingName =
                      editing?.id === item.id && editing.field === "name";
                    const editingDescription =
                      editing?.id === item.id &&
                      editing.field === "description";
                    const isEditing = editingName || editingDescription;
                    const isDragging = draggingId === item.id;

                    return (
                      <li
                        key={item.id}
                        className={`item item-${column.id}${
                          isDragging ? " item-dragging" : ""
                        }${isEditing ? "" : " item-draggable"}`}
                        draggable={!isEditing}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                      >
                        <div
                          className="item-header"
                          onClick={() => {
                            if (!editingName) startFieldEdit(item, "name");
                          }}
                        >
                          {editingName ? (
                            <input
                              className="item-header-input"
                              type="text"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => saveFieldEdit(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  clearEditing();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <strong>{item.name}</strong>
                          )}
                          <button
                            type="button"
                            className="item-delete"
                            aria-label={`Delete ${item.name}`}
                            title="Delete"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div
                          className="item-body"
                          onClick={() => {
                            if (!editingDescription) {
                              startFieldEdit(item, "description");
                            }
                          }}
                        >
                          {editingDescription ? (
                            <textarea
                              className="item-description-input"
                              value={draft}
                              rows={3}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => saveFieldEdit(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  clearEditing();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <p className="item-description">
                              {item.description || "No description"}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {!isAdding && columnItems.length === 0 && (
                  <p className="empty">Drop items here</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

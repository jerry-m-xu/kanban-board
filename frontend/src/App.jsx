import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import DependencyGraphModal from "./DependencyGraphModal";
import "./App.css";

const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To-do" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

const DATE_FILTER_MODES = [
  { id: "any", label: "Any due date" },
  { id: "on", label: "Due on" },
  { id: "before", label: "Due before" },
  { id: "after", label: "Due after" },
  { id: "between", label: "Due between" },
];

const PAST_OR_TODAY_COLUMNS = new Set(["backlog", "done"]);
const TODAY_OR_FUTURE_COLUMNS = new Set(["todo", "in-progress"]);

const emptyForm = { name: "", description: "", due_date: "" };

function sortByPosition(a, b) {
  const positionDiff = (a.position ?? 0) - (b.position ?? 0);
  if (positionDiff !== 0) return positionDiff;
  return a.id - b.id;
}

function withRenumberedPositions(columnItems) {
  return columnItems.map((item, index) => ({ ...item, position: index }));
}

function buildPrerequisiteMap(items) {
  const map = {};
  for (const item of items) {
    map[item.id] = [...(item.prerequisites || [])];
  }
  return map;
}

function prerequisitesCreateCycle(items, itemId, prerequisites) {
  if (prerequisites.includes(itemId)) return true;

  const graph = buildPrerequisiteMap(items);
  graph[itemId] = [...prerequisites];

  const adjacency = {};
  for (const [dependentId, prereqIds] of Object.entries(graph)) {
    for (const prereqId of prereqIds) {
      if (!adjacency[prereqId]) adjacency[prereqId] = [];
      adjacency[prereqId].push(Number(dependentId));
    }
  }

  const visiting = new Set();
  const visited = new Set();

  function visit(nodeId) {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const nextId of adjacency[nodeId] || []) {
      if (visit(nextId)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  const nodeIds = new Set([
    ...Object.keys(graph).map(Number),
    ...Object.keys(adjacency).map(Number),
  ]);
  for (const nodeId of nodeIds) {
    if (visit(nodeId)) return true;
  }
  return false;
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueDateRuleMessage(columnId) {
  if (PAST_OR_TODAY_COLUMNS.has(columnId)) {
    return "Backlog and Done only allow tasks due today or earlier";
  }
  return "To-do and In Progress only allow tasks due today or later";
}

function isDueDateAllowedForColumn(dueDate, columnId) {
  if (!dueDate) return false;
  const today = todayISO();
  if (PAST_OR_TODAY_COLUMNS.has(columnId)) return dueDate <= today;
  if (TODAY_OR_FUTURE_COLUMNS.has(columnId)) return dueDate >= today;
  return true;
}

function columnDateInputBounds(columnId) {
  const today = todayISO();
  if (PAST_OR_TODAY_COLUMNS.has(columnId)) return { max: today };
  if (TODAY_OR_FUTURE_COLUMNS.has(columnId)) return { min: today };
  return {};
}

function formatDueDate(value) {
  if (!value) return "No due date";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function matchesDateFilter(item, mode, dateFrom, dateTo) {
  if (mode === "any") return true;

  const dueDate = item.due_date || "";
  if (!dueDate) return false;

  if (mode === "on") {
    return Boolean(dateFrom) && dueDate === dateFrom;
  }
  if (mode === "before") {
    return Boolean(dateFrom) && dueDate < dateFrom;
  }
  if (mode === "after") {
    return Boolean(dateFrom) && dueDate > dateFrom;
  }
  if (mode === "between") {
    if (!dateFrom || !dateTo) return false;
    const start = dateFrom <= dateTo ? dateFrom : dateTo;
    const end = dateFrom <= dateTo ? dateTo : dateFrom;
    return dueDate >= start && dueDate <= end;
  }
  return true;
}

export default function App() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [addingColumn, setAddingColumn] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilterMode, setDateFilterMode] = useState("any");
  const [dateFilterFrom, setDateFilterFrom] = useState("");
  const [dateFilterTo, setDateFilterTo] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [graphItemId, setGraphItemId] = useState(null);
  const [addingPrereqForId, setAddingPrereqForId] = useState(null);
  const [expandedPrereqIds, setExpandedPrereqIds] = useState(() => new Set());
  const draggedRef = useRef(false);
  const statusTimeoutRef = useRef(null);
  const itemsCountRef = useRef(0);

  useEffect(() => {
    itemsCountRef.current = items.length;
  }, [items]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  function itemCountMessage(count = itemsCountRef.current) {
    return `${count} item(s)`;
  }

  function showStatus(message, isError = false) {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }

    const normalized = message || itemCountMessage();
    setStatus(normalized);
    setError(Boolean(message) && isError);

    const isCountMessage = /^\d+ item\(s\)$/.test(normalized);
    const isLoadingMessage = normalized === "Loading...";
    if (!message || isCountMessage || isLoadingMessage) {
      return;
    }

    statusTimeoutRef.current = window.setTimeout(() => {
      setStatus(itemCountMessage());
      setError(false);
      statusTimeoutRef.current = null;
    }, 5000);
  }

  function togglePrereqExpanded(itemId) {
    setExpandedPrereqIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function loadItems() {
    showStatus("Loading...");
    try {
      const data = await api();
      setItems(data);
      itemsCountRef.current = data.length;
      showStatus(itemCountMessage(data.length));
    } catch (err) {
      showStatus(err.message, true);
      setItems([]);
      itemsCountRef.current = 0;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function savePrerequisites(item, prerequisites) {
    const unique = [...new Set(prerequisites.map(Number))];
    if (unique.includes(item.id)) {
      showStatus("An item cannot be a prerequisite of itself", true);
      return;
    }
    if (prerequisitesCreateCycle(items, item.id, unique)) {
      showStatus("That prerequisite would create a cycle", true);
      return;
    }
    if ((item.status || "backlog") === "done") {
      const invalid = unique.find((prereqId) => {
        const prereq = items.find((entry) => entry.id === prereqId);
        return !prereq || (prereq.status || "backlog") !== "done";
      });
      if (invalid) {
        showStatus(
          "Done tasks can only have prerequisites that are also in Done",
          true
        );
        return;
      }
    }

    const previousItems = items;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, prerequisites: unique } : entry
      )
    );
    showStatus("Saving...");

    try {
      await api(`/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ prerequisites: unique }),
      });
      showStatus("Prerequisites updated");
    } catch (err) {
      setItems(previousItems);
      showStatus(err.message, true);
    }
  }

  async function addPrerequisite(item, prerequisiteId) {
    const nextId = Number(prerequisiteId);
    if (!nextId) return;
    const current = item.prerequisites || [];
    if (current.includes(nextId)) return;
    await savePrerequisites(item, [...current, nextId]);
  }

  async function removePrerequisite(item, prerequisiteId) {
    const current = item.prerequisites || [];
    await savePrerequisites(
      item,
      current.filter((id) => id !== prerequisiteId)
    );
  }

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
    if (field === "name") {
      setDraft(item.name);
    } else if (field === "due_date") {
      setDraft(item.due_date || "");
    } else {
      setDraft(item.description || "");
    }
    showStatus("");
  }

  async function saveFieldEdit(item) {
    if (!editing || editing.id !== item.id) return;

    const field = editing.field;
    const nextValue = draft.trim();
    const previous =
      field === "name"
        ? item.name
        : field === "due_date"
          ? item.due_date || ""
          : item.description || "";

    if (field === "name" && !nextValue) {
      showStatus("Name is required", true);
      setDraft(item.name);
      clearEditing();
      return;
    }

    if (field === "due_date") {
      if (!nextValue) {
        showStatus("Due date is required", true);
        setDraft(item.due_date || "");
        clearEditing();
        return;
      }
      if (!isDueDateAllowedForColumn(nextValue, item.status || "backlog")) {
        showStatus(dueDateRuleMessage(item.status || "backlog"), true);
        setDraft(item.due_date || "");
        clearEditing();
        return;
      }
    }

    if (nextValue === previous) {
      clearEditing();
      return;
    }

    const payload =
      field === "name"
        ? { name: nextValue }
        : field === "due_date"
          ? { due_date: nextValue }
          : { description: nextValue };

    const previousItems = items;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              ...payload,
              due_date:
                field === "due_date" ? nextValue || null : entry.due_date,
            }
          : entry
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

    if (!form.due_date) {
      showStatus("Due date is required", true);
      return;
    }
    if (!isDueDateAllowedForColumn(form.due_date, columnId)) {
      showStatus(dueDateRuleMessage(columnId), true);
      return;
    }

    showStatus("Saving...");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: columnId,
      due_date: form.due_date,
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

  async function persistItemUpdates(updates) {
    await Promise.all(
      updates.map((update) =>
        api(`/${update.id}`, {
          method: "PUT",
          body: JSON.stringify({
            status: update.status,
            position: update.position,
          }),
        })
      )
    );
  }

  async function placeItem(itemId, targetStatus, targetIndex) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    const sourceStatus = item.status || "backlog";
    if (
      sourceStatus !== targetStatus &&
      !isDueDateAllowedForColumn(item.due_date, targetStatus)
    ) {
      showStatus(
        item.due_date
          ? dueDateRuleMessage(targetStatus)
          : `${dueDateRuleMessage(targetStatus)}. Set a due date first.`,
        true
      );
      return;
    }

    if (sourceStatus !== targetStatus) {
      if (targetStatus === "done") {
        const invalidPrereq = (item.prerequisites || []).find((prereqId) => {
          const prereq = items.find((entry) => entry.id === prereqId);
          return !prereq || (prereq.status || "backlog") !== "done";
        });
        if (invalidPrereq) {
          showStatus(
            "Done tasks can only have prerequisites that are also in Done",
            true
          );
          return;
        }
      }

      if (targetStatus !== "done") {
        const blockedDependent = items.find(
          (entry) =>
            entry.id !== itemId &&
            (entry.status || "backlog") === "done" &&
            (entry.prerequisites || []).includes(itemId)
        );
        if (blockedDependent) {
          showStatus(
            "Cannot move this task out of Done while other Done tasks still list it as a prerequisite",
            true
          );
          return;
        }
      }
    }

    const sourceItems = items
      .filter(
        (entry) =>
          (entry.status || "backlog") === sourceStatus && entry.id !== itemId
      )
      .sort(sortByPosition);
    const targetItemsBase =
      sourceStatus === targetStatus
        ? sourceItems
        : items
            .filter((entry) => (entry.status || "backlog") === targetStatus)
            .sort(sortByPosition);

    const clampedIndex = Math.max(
      0,
      Math.min(targetIndex, targetItemsBase.length)
    );
    const nextTargetItems = withRenumberedPositions([
      ...targetItemsBase.slice(0, clampedIndex),
      { ...item, status: targetStatus },
      ...targetItemsBase.slice(clampedIndex),
    ]);

    const nextSourceItems =
      sourceStatus === targetStatus
        ? nextTargetItems
        : withRenumberedPositions(sourceItems);

    const previousItems = items;
    const nextItems = items.map((entry) => {
      if (sourceStatus !== targetStatus) {
        const sourceMatch = nextSourceItems.find((row) => row.id === entry.id);
        if (sourceMatch) return sourceMatch;
      }
      const targetMatch = nextTargetItems.find((row) => row.id === entry.id);
      if (targetMatch) return targetMatch;
      return entry;
    });

    const unchanged =
      sourceStatus === targetStatus &&
      (item.position ?? 0) === clampedIndex &&
      items
        .filter((entry) => (entry.status || "backlog") === sourceStatus)
        .sort(sortByPosition)
        .every((entry, index) => entry.id === nextTargetItems[index]?.id);

    if (unchanged) return;

    setItems(nextItems);
    showStatus("Moving...");

    const updates = [
      ...nextTargetItems.map((entry) => ({
        id: entry.id,
        status: entry.status,
        position: entry.position,
      })),
    ];
    if (sourceStatus !== targetStatus) {
      updates.push(
        ...nextSourceItems.map((entry) => ({
          id: entry.id,
          status: entry.status,
          position: entry.position,
        }))
      );
    }

    const uniqueUpdates = Array.from(
      new Map(updates.map((update) => [update.id, update])).values()
    );

    try {
      await persistItemUpdates(uniqueUpdates);
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
    setDragOverItem(null);
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
      setDragOverItem(null);
    }
  }

  async function handleColumnDrop(e, columnId) {
    e.preventDefault();
    const rawId = e.dataTransfer.getData("text/plain");
    const itemId = Number(rawId);
    setDraggingId(null);
    setDragOverColumn(null);
    setDragOverItem(null);
    if (!Number.isFinite(itemId)) return;

    const columnItems = allItemsForColumn(columnId).filter(
      (entry) => entry.id !== itemId
    );
    await placeItem(itemId, columnId, columnItems.length);
  }

  function handleItemDragOver(e, item, columnId) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    if (draggingId === item.id) {
      setDragOverItem(null);
      return;
    }

    const bounds = e.currentTarget.getBoundingClientRect();
    const edge = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDragOverColumn(columnId);
    setDragOverItem((current) => {
      if (current?.id === item.id && current.edge === edge) return current;
      return { id: item.id, edge };
    });
  }

  async function handleItemDrop(e, item, columnId) {
    e.preventDefault();
    e.stopPropagation();
    const rawId = e.dataTransfer.getData("text/plain");
    const itemId = Number(rawId);
    const edge = dragOverItem?.id === item.id ? dragOverItem.edge : "before";
    setDraggingId(null);
    setDragOverColumn(null);
    setDragOverItem(null);
    if (!Number.isFinite(itemId) || itemId === item.id) return;

    const columnItems = allItemsForColumn(columnId).filter(
      (entry) => entry.id !== itemId
    );
    const targetIndex = columnItems.findIndex((entry) => entry.id === item.id);
    if (targetIndex === -1) return;

    const insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
    await placeItem(itemId, columnId, insertIndex);
  }

  function allItemsForColumn(columnId) {
    return items
      .filter((item) => (item.status || "backlog") === columnId)
      .sort(sortByPosition);
  }

  function visibleItemsForColumn(columnId) {
    const query = searchQuery.trim().toLowerCase();
    return allItemsForColumn(columnId).filter((item) => {
      if (query) {
        const name = (item.name || "").toLowerCase();
        const description = (item.description || "").toLowerCase();
        if (!name.includes(query) && !description.includes(query)) {
          return false;
        }
      }
      return matchesDateFilter(
        item,
        dateFilterMode,
        dateFilterFrom,
        dateFilterTo
      );
    });
  }

  function renderAddForm(columnId) {
    const dateBounds = columnDateInputBounds(columnId);
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
          type="date"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          aria-label="Due date"
          required
          min={dateBounds.min}
          max={dateBounds.max}
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

  const showDateFrom = dateFilterMode !== "any";
  const showDateTo = dateFilterMode === "between";

  return (
    <main>
      <header className="board-toolbar">
        <h1>Kanban Board</h1>
        <div className="board-filters">
          <div className="date-filter">
            <label>
              <span className="visually-hidden">Due date filter</span>
              <select
                value={dateFilterMode}
                onChange={(e) => setDateFilterMode(e.target.value)}
                aria-label="Due date filter mode"
              >
                {DATE_FILTER_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
            {showDateFrom && (
              <label>
                <span className="visually-hidden">
                  {dateFilterMode === "between" ? "Start date" : "Date"}
                </span>
                <input
                  type="date"
                  value={dateFilterFrom}
                  onChange={(e) => setDateFilterFrom(e.target.value)}
                />
              </label>
            )}
            {showDateTo && (
              <label>
                <span className="visually-hidden">End date</span>
                <input
                  type="date"
                  value={dateFilterTo}
                  onChange={(e) => setDateFilterTo(e.target.value)}
                />
              </label>
            )}
          </div>
          <label className="search-field">
            <span className="visually-hidden">Search cards</span>
            <input
              type="search"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search cards"
            />
          </label>
        </div>
      </header>

      <p className={`status${error ? " error" : ""}`}>{status}</p>

      {loading ? (
        <p className="empty">Loading...</p>
      ) : (
        <div className="board">
          {COLUMNS.map((column) => {
            const columnItems = visibleItemsForColumn(column.id);
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
                    const editingDueDate =
                      editing?.id === item.id && editing.field === "due_date";
                    const editingDescription =
                      editing?.id === item.id &&
                      editing.field === "description";
                    const isEditing =
                      editingName || editingDueDate || editingDescription;
                    const isDragging = draggingId === item.id;
                    const dropEdge =
                      dragOverItem?.id === item.id ? dragOverItem.edge : null;
                    const dueDateBounds = columnDateInputBounds(
                      item.status || column.id
                    );

                    return (
                      <li
                        key={item.id}
                        data-item-id={item.id}
                        className={`item item-${column.id}${
                          isDragging ? " item-dragging" : ""
                        }${isEditing ? "" : " item-draggable"}${
                          dropEdge === "before" ? " drop-before" : ""
                        }${dropEdge === "after" ? " drop-after" : ""}`}
                        draggable={!isEditing}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) =>
                          handleItemDragOver(e, item, column.id)
                        }
                        onDrop={(e) => handleItemDrop(e, item, column.id)}
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
                        <div className="item-body">
                          <div
                            className={`item-due${
                              item.due_date ? "" : " item-due-empty"
                            }`}
                            onClick={() => {
                              if (!editingDueDate) {
                                startFieldEdit(item, "due_date");
                              }
                            }}
                          >
                            {editingDueDate ? (
                              <input
                                className="item-due-input"
                                type="date"
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
                                min={dueDateBounds.min}
                                max={dueDateBounds.max}
                                required
                                autoFocus
                              />
                            ) : (
                              <span>Due: {formatDueDate(item.due_date)}</span>
                            )}
                          </div>
                          <div
                            className="item-prerequisites"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="item-prerequisites-header">
                              <button
                                type="button"
                                className="item-prerequisites-label"
                                onClick={() => setGraphItemId(item.id)}
                              >
                                Prerequisites
                              </button>
                              <div className="item-prerequisites-actions">
                                <button
                                  type="button"
                                  className="prereq-expand-button"
                                  aria-label={
                                    expandedPrereqIds.has(item.id)
                                      ? "Collapse prerequisites"
                                      : "Expand prerequisites"
                                  }
                                  aria-expanded={expandedPrereqIds.has(item.id)}
                                  title={
                                    expandedPrereqIds.has(item.id)
                                      ? "Collapse"
                                      : "Expand"
                                  }
                                  onClick={() => togglePrereqExpanded(item.id)}
                                >
                                  {expandedPrereqIds.has(item.id) ? "▾" : "▸"}
                                </button>
                                {addingPrereqForId === item.id ? (
                                  <select
                                    className="prereq-add-select"
                                    value=""
                                    autoFocus
                                    onBlur={() => {
                                      window.setTimeout(() => {
                                        setAddingPrereqForId((current) =>
                                          current === item.id ? null : current
                                        );
                                      }, 150);
                                    }}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value) {
                                        addPrerequisite(item, value);
                                        setExpandedPrereqIds((current) => {
                                          const next = new Set(current);
                                          next.add(item.id);
                                          return next;
                                        });
                                      }
                                      setAddingPrereqForId(null);
                                    }}
                                    aria-label="Add prerequisite"
                                  >
                                    <option value="">Select task…</option>
                                    {items
                                      .filter((entry) => {
                                        if (entry.id === item.id) return false;
                                        return !(
                                          item.prerequisites || []
                                        ).includes(entry.id);
                                      })
                                      .map((entry) => (
                                        <option key={entry.id} value={entry.id}>
                                          {entry.name}
                                        </option>
                                      ))}
                                  </select>
                                ) : (
                                  <button
                                    type="button"
                                    className="prereq-add-button"
                                    aria-label="Add prerequisite"
                                    title="Add prerequisite"
                                    onClick={() =>
                                      setAddingPrereqForId(item.id)
                                    }
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                            </div>
                            {expandedPrereqIds.has(item.id) &&
                              ((item.prerequisites || []).length === 0 ? (
                                <p className="item-prerequisites-empty">None</p>
                              ) : (
                                <ul className="item-prerequisites-list">
                                  {(item.prerequisites || []).map(
                                    (prereqId) => {
                                      const prereq = items.find(
                                        (entry) => entry.id === prereqId
                                      );
                                      return (
                                        <li key={prereqId}>
                                          <span>
                                            {prereq
                                              ? prereq.name
                                              : `#${prereqId}`}
                                          </span>
                                          <button
                                            type="button"
                                            className="prereq-remove"
                                            aria-label={`Remove prerequisite ${
                                              prereq ? prereq.name : prereqId
                                            }`}
                                            onClick={() =>
                                              removePrerequisite(item, prereqId)
                                            }
                                          >
                                            ×
                                          </button>
                                        </li>
                                      );
                                    }
                                  )}
                                </ul>
                              ))}
                          </div>
                          <div
                            className="item-description-wrap"
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

      {graphItemId != null &&
        items.some((entry) => entry.id === graphItemId) && (
          <DependencyGraphModal
            rootItem={items.find((entry) => entry.id === graphItemId)}
            items={items}
            onClose={() => setGraphItemId(null)}
          />
        )}
    </main>
  );
}

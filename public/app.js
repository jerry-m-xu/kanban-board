const API = "/api/items";

const form = document.getElementById("item-form");
const formTitle = document.getElementById("form-title");
const itemIdInput = document.getElementById("item-id");
const nameInput = document.getElementById("name");
const descriptionInput = document.getElementById("description");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const itemList = document.getElementById("item-list");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function api(path = "", options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function resetForm() {
  form.reset();
  itemIdInput.value = "";
  formTitle.textContent = "Add item";
  submitBtn.textContent = "Create";
  cancelBtn.hidden = true;
}

function startEdit(item) {
  itemIdInput.value = item.id;
  nameInput.value = item.name;
  descriptionInput.value = item.description || "";
  formTitle.textContent = "Edit item";
  submitBtn.textContent = "Update";
  cancelBtn.hidden = false;
  nameInput.focus();
}

function renderItems(items) {
  if (items.length === 0) {
    itemList.innerHTML = '<li class="empty">No items yet.</li>';
    return;
  }

  itemList.innerHTML = items
    .map(
      (item) => `
    <li class="item" data-id="${item.id}">
      <div class="item-info">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.description || "No description")}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="small edit-btn">Edit</button>
        <button type="button" class="small danger delete-btn">Delete</button>
      </div>
    </li>
  `
    )
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadItems() {
  setStatus("Loading...");
  try {
    const items = await api();
    renderItems(items);
    setStatus(`${items.length} item(s)`);
  } catch (err) {
    setStatus(err.message, true);
    itemList.innerHTML = "";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Saving...");

  const payload = {
    name: nameInput.value.trim(),
    description: descriptionInput.value.trim(),
  };

  try {
    const id = itemIdInput.value;
    if (id) {
      await api(`/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      setStatus("Item updated");
    } else {
      await api("", { method: "POST", body: JSON.stringify(payload) });
      setStatus("Item created");
    }
    resetForm();
    await loadItems();
  } catch (err) {
    setStatus(err.message, true);
  }
});

cancelBtn.addEventListener("click", () => {
  resetForm();
  setStatus("");
});

itemList.addEventListener("click", async (e) => {
  const row = e.target.closest(".item");
  if (!row) return;

  const id = row.dataset.id;

  if (e.target.classList.contains("edit-btn")) {
    try {
      const item = await api(`/${id}`);
      startEdit(item);
      setStatus("");
    } catch (err) {
      setStatus(err.message, true);
    }
    return;
  }

  if (e.target.classList.contains("delete-btn")) {
    if (!confirm("Delete this item?")) return;

    setStatus("Deleting...");
    try {
      await api(`/${id}`, { method: "DELETE" });
      if (itemIdInput.value === id) resetForm();
      setStatus("Item deleted");
      await loadItems();
    } catch (err) {
      setStatus(err.message, true);
    }
  }
});

loadItems();

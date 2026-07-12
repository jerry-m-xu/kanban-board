const API = "/api/items";

export async function api(path = "", options = {}) {
  const headers = { ...(options.headers || {}) };
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    const message =
      data.error ||
      (typeof data.detail === "string" ? data.detail : null) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function uploadAttachment(itemId, file) {
  const body = new FormData();
  body.append("file", file);
  return api(`/${itemId}/attachments`, {
    method: "POST",
    body,
  });
}

export async function deleteAttachment(attachmentId) {
  const response = await fetch(`/api/attachments/${attachmentId}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    const message =
      (typeof data.detail === "string" ? data.detail : null) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }
  return null;
}

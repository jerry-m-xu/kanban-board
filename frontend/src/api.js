const API = "/api/items";

export async function api(path = "", options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

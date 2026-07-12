const TOKEN_KEY = "kanban_auth_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
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

const API = "/api/items";

export async function api(path = "", options = {}) {
  return request(`${API}${path}`, options);
}

export async function authRequest(path = "", options = {}) {
  return request(`/api/auth${path}`, options);
}

export async function fetchAuthConfig() {
  return authRequest("/config");
}

export async function signInWithGoogleCredential(credential) {
  return authRequest("/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function fetchCurrentUser() {
  return authRequest("/me");
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
  return request(`/api/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

/** Append JWT for <img>/<video> tags that cannot send Authorization headers. */
export function mediaUrl(url) {
  if (!url) return url;
  const token = getToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

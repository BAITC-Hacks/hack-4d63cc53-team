const configuredBase = window.API_BASE;
const host = window.location.hostname || "127.0.0.1";
const API_BASE = (configuredBase || `${window.location.protocol}//${host}:8000/api`).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.task = payload?.detail?.task || null;
  }
}

function emitConnectionStatus(online) {
  window.dispatchEvent(new CustomEvent("api-connection", { detail: { online } }));
}

export async function request(path, options = {}) {
  let response;
  let raw;
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      body,
    });
    raw = await response.text();
  } catch (error) {
    emitConnectionStatus(false);
    throw new ApiError("Не удалось связаться с сервером. Проверьте подключение и повторите попытку.", 0, { cause: error });
  }

  // Any HTTP response proves reachability; validation and business errors are not offline.
  emitConnectionStatus(true);
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch { throw new ApiError("Сервер вернул ответ, который не удалось прочитать.", response.status, null); }
  }
  if (!response.ok) {
    const detail = payload?.detail;
    const message = typeof detail === "string" ? detail : detail?.message || `Запрос завершился ошибкой (${response.status}).`;
    throw new ApiError(message, response.status, payload);
  }
  if (payload === null || typeof payload !== "object") throw new ApiError("Сервер вернул пустой или некорректный ответ.", response.status, payload);
  return payload;
}

export const api = {
  analyze: (description, answers = {}) => request("/analyze", { method: "POST", body: { description, answers } }),
  listTasks: () => request("/tasks"),
  getTask: (id) => request(`/tasks/${encodeURIComponent(id)}`),
  createTask: (rawDescription, fields) => request("/tasks", { method: "POST", body: { rawDescription, fields } }),
  patchTask: (id, expectedRevision, fields) => request(`/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: { expectedRevision, fields } }),
  confirmTask: (id, expectedRevision, fields) => request(`/tasks/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { expectedRevision, fields } }),
  publishTask: (id, expectedRevision) => request(`/tasks/${encodeURIComponent(id)}/publish`, { method: "POST", body: { expectedRevision } }),
};

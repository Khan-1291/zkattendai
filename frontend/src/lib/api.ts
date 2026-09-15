const API_URL =
  (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(body?.error ?? "Request failed", res.status);
  }

  return body as T;
}

export const api = {
  post: <T>(path: string, data: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data), token }),
  put: <T>(path: string, data: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data), token }),
  get: <T>(path: string, token?: string) => request<T>(path, { method: "GET", token }),
  patch: <T>(path: string, data: unknown, token?: string) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data), token }),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: "DELETE", token }),
};

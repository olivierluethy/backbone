/**
 * A tiny typed HTTP client. Every method attaches the bearer token, so Backbone marks
 * these endpoints auth-protected.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token ?? ""}`,
  };
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
    return res.json() as Promise<T>;
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  },
  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  },
  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.json() as Promise<T>;
  },
};

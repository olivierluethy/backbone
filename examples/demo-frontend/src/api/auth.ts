import type { User } from "../models/user";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export async function login(input: Credentials): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<AuthResponse>;
}

export async function register(input: Credentials): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<AuthResponse>;
}

export async function me(): Promise<User> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
  });
  return res.json() as Promise<User>;
}

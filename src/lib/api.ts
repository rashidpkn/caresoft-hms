"use client";

type Me = {
  user: {
    id: string;
    username: string;
    fullName: string;
    roleCode: string;
    roleName: string;
    permissions: string[];
    mustChangePassword: boolean;
  };
  csrfToken: string;
};

let csrf = "";

export function setCsrf(token: string) {
  csrf = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (csrf && init?.method && init.method !== "GET") headers.set("X-CSRF-Token", csrf);
  let res: Response;
  try {
    res = await fetch(`/api/${path.replace(/^\//, "")}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the HMS server. Check LAN connection.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    const message = json?.error?.message ?? "Request failed";
    throw new ApiError(res.status, json?.error?.code ?? "error", message);
  }
  return json.data as T;
}

export async function fetchMe(): Promise<Me> {
  const data = await api<Me>("auth/me");
  setCsrf(data.csrfToken);
  return data;
}

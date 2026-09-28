// Low-level HTTP access to the HList server. Authentication is cookie based (session + remember-me);
// state-changing requests echo the XSRF-TOKEN cookie in the X-XSRF-TOKEN header.

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as application/x-www-form-urlencoded (used by the login endpoint). */
  form?: Record<string, string>;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler = () => {};

/** Called whenever an authenticated request is rejected with 401 (session and remember-me both gone). */
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

export function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const entry = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

async function csrfToken(): Promise<string> {
  // The server clears the token on login/logout; fetching /api/auth/csrf issues a fresh cookie.
  if (!readCookie("XSRF-TOKEN")) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
  }
  return readCookie("XSRF-TOKEN") ?? "";
}

export interface RawResponse<T> {
  status: number;
  ok: boolean;
  data: T | null;
  message: string | null;
}

/** Performs a request without treating error statuses as exceptions. */
export async function send<T>(path: string, options: RequestOptions = {}): Promise<RawResponse<T>> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-XSRF-TOKEN"] = await csrfToken();

  let body: BodyInit | undefined;
  if (options.form !== undefined) {
    body = new URLSearchParams(options.form);
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  const text = response.status === 204 ? "" : await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  const message = (data as { message?: unknown } | null)?.message;
  return {
    status: response.status,
    ok: response.ok,
    data: response.ok ? (data as T) : null,
    message: typeof message === "string" ? message : null,
  };
}

/** Performs an authenticated request; throws ApiError on failure and reports 401s to the unauthorized handler. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send<T>(path, options);
  if (response.status === 401) {
    unauthorizedHandler();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, response.message ?? `Request failed (${response.status})`);
  }
  return response.data as T;
}

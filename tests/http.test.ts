import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, onUnauthorized, readCookie, request, send } from "../src/api/http";

function clearCookies() {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("http client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    clearCookies();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends GET requests without a CSRF token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { username: "sam" }));
    await expect(request("/api/users/me")).resolves.toEqual({ username: "sam" });
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)["X-XSRF-TOKEN"]).toBeUndefined();
    expect(init?.credentials).toBe("same-origin");
  });

  it("fetches a CSRF cookie before the first state-changing request and echoes it", async () => {
    fetchMock.mockImplementationOnce(async () => {
      document.cookie = "XSRF-TOKEN=abc%20123; path=/";
      return new Response(null, { status: 204 });
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { shoppingListId: 1 }));

    await request("/api/shopping-lists", { method: "POST", body: { name: "Weekly" } });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/csrf");
    const [path, init] = fetchMock.mock.calls[1];
    const headers = init?.headers as Record<string, string>;
    expect(path).toBe("/api/shopping-lists");
    expect(headers["X-XSRF-TOKEN"]).toBe("abc 123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.body).toBe('{"name":"Weekly"}');
  });

  it("reuses an existing CSRF cookie and sends forms url-encoded", async () => {
    document.cookie = "XSRF-TOKEN=token; path=/";
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await send("/api/auth/login", { method: "POST", form: { username: "sam", password: "p&w" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.toString()).toBe("username=sam&password=p%26w");
  });

  it("reports 401s and raises server messages", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    await expect(request("/api/shopping-lists")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "Username already exists" }));
    await expect(request("/api/items")).rejects.toThrow("Username already exists");
  });

  it("turns network failures into a readable error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await request("/api/items").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it("reads cookies by exact name", () => {
    document.cookie = "XSRF-TOKEN-OLD=nope; path=/";
    document.cookie = "XSRF-TOKEN=yes; path=/";
    expect(readCookie("XSRF-TOKEN")).toBe("yes");
    expect(readCookie("missing")).toBeNull();
  });
});

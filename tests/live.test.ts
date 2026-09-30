import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.OPEN;
  onerror: (() => void) | null = null;
  private readonly handlers = new Map<string, (message: { data: string }) => void>();

  constructor(readonly url: string, readonly init?: EventSourceInit) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (message: { data: string }) => void): void {
    this.handlers.set(type, handler);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  push(data: object): void {
    this.handlers.get("change")?.({ data: JSON.stringify(data) });
  }

  fail(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("live updates", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects only while a screen listens and passes on other devices' changes", async () => {
    const { subscribe } = await import("../src/lib/live");
    const { clientId } = await import("../src/api/http");
    const seen: unknown[] = [];

    const stop = subscribe((event) => seen.push(event));
    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe("/api/events");
    expect(source.init?.withCredentials).toBe(true);

    source.push({ type: "list-items", listId: 3, origin: "other-device" });
    source.push({ type: "list-items", listId: 3, origin: clientId });
    expect(seen).toEqual([{ type: "list-items", listId: 3, origin: "other-device" }]);

    const stopSecond = subscribe(() => {});
    expect(FakeEventSource.instances).toHaveLength(1);
    stop();
    expect(source.readyState).toBe(FakeEventSource.OPEN);
    stopSecond();
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });

  it("reconnects after the browser gives up", async () => {
    const { subscribe } = await import("../src/lib/live");
    const stop = subscribe(() => {});
    FakeEventSource.instances[0].fail();
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(5_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    stop();
  });

  it("disconnects in the background and asks for a reload on resume", async () => {
    const { subscribe } = await import("../src/lib/live");
    const seen: unknown[] = [];
    const stop = subscribe((event) => seen.push(event));

    setVisibility("hidden");
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    setVisibility("visible");
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(seen).toEqual([{ type: "resume" }]);
    stop();
  });

  it("collapses a burst of events into one quiet reload", async () => {
    const { debounced } = await import("../src/lib/live");
    const reload = vi.fn(() => Promise.reject(new Error("offline")));
    const trigger = debounced(reload);
    trigger();
    trigger();
    trigger();
    vi.advanceTimersByTime(200);
    expect(reload).toHaveBeenCalledOnce();
  });
});

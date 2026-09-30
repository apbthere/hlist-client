// Live updates from the server (GET /api/events, Server-Sent Events). Screens subscribe while they are shown;
// the connection is open only while at least one screen listens and the app is in the foreground.

import { clientId } from "../api/http";

export type LiveChangeType = "lists" | "list-items" | "items" | "catalog";

export interface LiveChange {
  type: LiveChangeType;
  listId?: number;
  origin?: string;
}

/**
 * A change made on another device, or "resume" when the app returns to the foreground (events may have been
 * missed while it was in the background, so everything shown should be reloaded).
 */
export type LiveEvent = LiveChange | { type: "resume" };

type Listener = (event: LiveEvent) => void;

const RECONNECT_DELAY_MS = 5_000;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let visibilityHooked = false;

/** Listens for live updates until the returned function is called. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  hookVisibility();
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  };
}

/** Closes the connection, e.g. on sign-out. Screens that still listen reconnect when shown again. */
export function disconnect(): void {
  clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  source?.close();
  source = null;
}

function connect(): void {
  if (source || listeners.size === 0 || typeof EventSource === "undefined") return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const events = new EventSource("/api/events", { withCredentials: true });
  events.addEventListener("change", (message) => {
    let change: LiveChange;
    try {
      change = JSON.parse((message as MessageEvent<string>).data) as LiveChange;
    } catch {
      return;
    }
    if (change.origin === clientId) return; // this device made the change and already shows it
    emit(change);
  });
  events.onerror = () => {
    // EventSource retries by itself while the connection is merely interrupted. Once it gives up (e.g. the
    // session expired while the phone slept), open a new one; the remember-me cookie signs it back in.
    if (events.readyState === EventSource.CLOSED && source === events) {
      source = null;
      scheduleReconnect();
    }
  };
  source = events;
}

function scheduleReconnect(): void {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, RECONNECT_DELAY_MS);
}

function emit(event: LiveEvent): void {
  for (const listener of [...listeners]) listener(event);
}

function hookVisibility(): void {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // iOS suspends background web apps and drops their connections anyway.
      disconnect();
    } else if (listeners.size > 0) {
      connect();
      emit({ type: "resume" });
    }
  });
}

/**
 * Wraps a reload so a burst of events (one change can send several) triggers a single call.
 * Errors are swallowed: a background refresh shouldn't interrupt the user.
 */
export function debounced(reload: () => Promise<unknown>, delayMs = 150): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      reload().catch(() => {});
    }, delayMs);
  };
}

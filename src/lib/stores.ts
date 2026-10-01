import type { StoreRef } from "../api/types";

/** The server's icon for a store a list names (GET /api/store-icons/{key}), or null when there is no store. */
export function storeIconUrl(store: StoreRef | null | undefined): string | null {
  return store?.key && /^[a-z0-9-]+$/.test(store.key) ? `/api/store-icons/${store.key}` : null;
}

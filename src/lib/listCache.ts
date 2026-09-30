import { reactive } from "vue";
import * as hlist from "../api/hlist";
import type { ShoppingList } from "../api/types";

/** Lists seen so far, so the items screen can show a list's name without another request. */
const listsById = reactive(new Map<number, ShoppingList>());

export function rememberLists(lists: ShoppingList[]): void {
  for (const list of lists) listsById.set(list.shoppingListId, list);
}

/** Drops a cached list so the next findList fetches it again (e.g. after another device changed it). */
export function forgetList(listId: number): void {
  listsById.delete(listId);
}

export function cachedList(listId: number): ShoppingList | undefined {
  return listsById.get(listId);
}

/**
 * Returns the list with the given id. The server has no single-list endpoint, so a cold start
 * (e.g. reopening the app on a list) pages through the user's lists until it is found.
 */
export async function findList(listId: number): Promise<ShoppingList | null> {
  const known = listsById.get(listId);
  if (known) return known;
  for (let page = 0; ; page++) {
    const result = await hlist.getLists(page, 100);
    rememberLists(result.content);
    const found = result.content.find((list) => list.shoppingListId === listId);
    if (found) return found;
    if (result.last) return null;
  }
}

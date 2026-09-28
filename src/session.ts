import { ref } from "vue";
import * as hlist from "./api/hlist";
import type { User } from "./api/types";

/** The signed-in user; null when signed out or not yet checked. */
export const currentUser = ref<User | null>(null);

let checked = false;

/** Resolves the signed-in user once per app load (a remember-me cookie restores the session here). */
export async function ensureUser(): Promise<User | null> {
  if (!checked) {
    currentUser.value = await hlist.currentUser();
    checked = true;
  }
  return currentUser.value;
}

export async function signIn(username: string, password: string, rememberMe: boolean): Promise<void> {
  await hlist.login(username, password, rememberMe);
  currentUser.value = await hlist.currentUser();
  checked = true;
}

export async function signOut(): Promise<void> {
  try {
    await hlist.logout();
  } finally {
    clearUser();
  }
}

export function clearUser(): void {
  currentUser.value = null;
  checked = true;
}

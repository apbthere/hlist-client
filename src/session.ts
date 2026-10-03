import { ref } from "vue";
import * as hlist from "./api/hlist";
import { disconnect as disconnectLiveUpdates } from "./lib/live";
import { signInWithPasskey } from "./lib/passkeys";
import { clearCachedPhotos } from "./lib/photos";
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

/** Signs in with a passkey; with `autofill`, waits for the person to pick it in the username field's AutoFill. */
export async function passkeySignIn(rememberMe: boolean | (() => boolean), autofill = false): Promise<void> {
  await signInWithPasskey(rememberMe, autofill);
  currentUser.value = await hlist.currentUser();
  checked = true;
}

export async function signOut(): Promise<void> {
  try {
    await hlist.logout();
  } finally {
    disconnectLiveUpdates();
    void clearCachedPhotos();
    clearUser();
  }
}

export function clearUser(): void {
  currentUser.value = null;
  checked = true;
}

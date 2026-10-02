import { createRouter, createWebHistory } from "@ionic/vue-router";
import type { RouteRecordRaw } from "vue-router";
import { onUnauthorized } from "./api/http";
import { clearUser, ensureUser } from "./session";
import LoginPage from "./views/LoginPage.vue";
import ListsPage from "./views/ListsPage.vue";
import ListItemsPage from "./views/ListItemsPage.vue";
import AddFromPage from "./views/AddFromPage.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/lists" },
  { path: "/login", component: LoginPage, meta: { public: true } },
  { path: "/lists", component: ListsPage },
  { path: "/lists/:listId(\\d+)", component: ListItemsPage, props: (route) => ({ listId: Number(route.params.listId) }) },
  { path: "/add", component: AddFromPage },
  { path: "/:pathMatch(.*)*", redirect: "/lists" },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  let user = null;
  try {
    user = await ensureUser();
  } catch {
    // Server unreachable: let the page load and show its own error rather than bouncing to login.
    return true;
  }
  if (to.meta.public) return user ? "/lists" : true;
  if (!user && to.path === "/add") rememberAfterSignIn(to.fullPath);
  return user ? true : { path: "/login", replace: true };
});

onUnauthorized(() => {
  clearUser();
  if (router.currentRoute.value.path !== "/login") void router.replace("/login");
});

const AFTER_SIGN_IN_KEY = "hlist.afterSignIn";

/** Keeps a product being added from a store's page while signing in. */
function rememberAfterSignIn(path: string): void {
  try {
    sessionStorage.setItem(AFTER_SIGN_IN_KEY, path);
  } catch {
    // Storage unavailable: the product is added again from the store's page after signing in.
  }
}

/** Where to go after signing in: back to adding a product, else the lists. */
export function pathAfterSignIn(): string {
  try {
    const path = sessionStorage.getItem(AFTER_SIGN_IN_KEY);
    sessionStorage.removeItem(AFTER_SIGN_IN_KEY);
    if (path?.startsWith("/add?")) return path;
  } catch {
    // Storage unavailable.
  }
  return "/lists";
}

export default router;

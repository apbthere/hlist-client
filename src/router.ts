import { createRouter, createWebHistory } from "@ionic/vue-router";
import type { RouteRecordRaw } from "vue-router";
import { onUnauthorized } from "./api/http";
import { clearUser, ensureUser } from "./session";
import LoginPage from "./views/LoginPage.vue";
import ListsPage from "./views/ListsPage.vue";
import ListItemsPage from "./views/ListItemsPage.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/lists" },
  { path: "/login", component: LoginPage, meta: { public: true } },
  { path: "/lists", component: ListsPage },
  { path: "/lists/:listId(\\d+)", component: ListItemsPage, props: (route) => ({ listId: Number(route.params.listId) }) },
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
  return user ? true : { path: "/login", replace: true };
});

onUnauthorized(() => {
  clearUser();
  if (router.currentRoute.value.path !== "/login") void router.replace("/login");
});

export default router;

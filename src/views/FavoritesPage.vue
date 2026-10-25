<template>
  <ion-page ref="page">
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="pickingFor ? `/lists/${pickingFor}` : '/lists'" :text="pickingFor ? 'List' : 'Lists'" />
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ title }}</ion-title>
        </ion-toolbar>
        <ion-toolbar v-if="favorites.length">
          <ion-searchbar v-model="query" placeholder="Name, brand, category or store" :debounce="0" />
        </ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" @ion-refresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!loaded" class="centered-spinner"><ion-spinner /></div>

      <div v-else-if="favorites.length === 0" class="empty-state">
        <ion-icon :icon="starOutline" />
        <h2>No Favorites Yet</h2>
        <p>On a list, swipe an item to the left and tap Favorite, or tap New Favorite.</p>
      </div>

      <div v-else-if="groups.length === 0" class="empty-state">
        <ion-icon :icon="searchOutline" />
        <h2>No Results</h2>
        <p>No favorite matches “{{ query.trim() }}”.</p>
      </div>

      <template v-else>
        <template v-for="group in groups" :key="group.category ?? 'other'">
          <div class="section-header">{{ group.title }}</div>
          <ion-list :inset="true">
            <ion-item-sliding v-for="favorite in group.favorites" :key="favorite.favoriteId" :disabled="pickingFor !== null">
              <ion-item-options side="start" @ion-swipe="chooseList(favorite, $event)">
                <ion-item-option color="primary" :expandable="true" @click="chooseList(favorite, $event)">
                  <ion-icon slot="top" :icon="cartOutline" />
                  Add
                </ion-item-option>
              </ion-item-options>

              <ion-item button :detail="false" @click="tap(favorite)">
                <span
                  v-if="pickingFor"
                  slot="start"
                  class="check"
                  :class="{ checked: picked.has(favorite.favoriteId) }"
                  aria-hidden="true"
                >
                  <ion-icon :icon="picked.has(favorite.favoriteId) ? checkmarkCircle : ellipseOutline" />
                </span>
                <div slot="start" class="thumb" :class="{ empty: !favorite.photoId }">
                  <img v-if="favorite.photoId" :src="thumbnailUrl(favorite.photoId)" alt="" loading="lazy" decoding="async" />
                  <ion-icon v-else :icon="star" />
                </div>
                <ion-label>
                  <h3>{{ favorite.name }}</h3>
                  <p v-if="describeFavorite(favorite, brands)">{{ describeFavorite(favorite, brands) }}</p>
                </ion-label>
              </ion-item>

              <ion-item-options side="end" @ion-swipe="remove(favorite, $event)">
                <ion-item-option color="danger" :expandable="true" @click="remove(favorite, $event)">
                  <ion-icon slot="top" :icon="trash" />
                  Delete
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
        </template>
        <p v-if="!pickingFor" class="section-footer">Swipe right to add a favorite to a list.</p>
        <div class="bottom-space" />
      </template>
    </ion-content>

    <ion-footer :translucent="true" class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button v-if="pickingFor" class="bar-action" :disabled="picked.size === 0 || adding" @click="addPicked">
            <ion-icon slot="start" :icon="addCircle" />
            {{ picked.size === 0 ? "Choose Favorites" : `Add ${picked.size} to List` }}
          </ion-button>
          <ion-button v-else class="bar-action" :disabled="!loaded" @click="edit(null)">
            <ion-icon slot="start" :icon="addCircle" />
            New Favorite
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>

    <ion-modal :is-open="editorOpen" :presenting-element="presentingElement" @did-dismiss="editorOpen = false">
      <favorite-editor-sheet
        :key="editorKey"
        :favorite="editing ?? undefined"
        :departments="departments"
        :brands="brands"
        :categories="categories"
        :stores="stores"
        @close="editorOpen = false"
        @saved="afterSave"
        @deleted="afterDelete"
      />
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonItemOption,
  IonItemOptions, IonItemSliding, IonLabel, IonList, IonModal, IonPage, IonRefresher, IonRefresherContent,
  IonSearchbar, IonSpinner, IonTitle, IonToolbar, actionSheetController, alertController, onIonViewWillEnter,
  toastController, useIonRouter,
} from "@ionic/vue";
import type { RefresherCustomEvent } from "@ionic/vue";
import {
  addCircle, cartOutline, checkmarkCircle, ellipseOutline, searchOutline, star, starOutline, trash,
} from "ionicons/icons";
import * as hlist from "../api/hlist";
import type { AddedToList, Favorite, ShoppingList, Store } from "../api/types";
import FavoriteEditorSheet from "../components/FavoriteEditorSheet.vue";
import { showError } from "../lib/feedback";
import { categoriesOf, describeFavorite, formatPrice, groupByCategory, listChoices, searchFavorites } from "../lib/favorites";
import { cachedList, findList, rememberLists } from "../lib/listCache";
import { debounced, subscribe } from "../lib/live";
import { thumbnailUrl } from "../lib/photos";

const props = defineProps<{
  /** Set when choosing favorites to add to this list (from the list's options). */
  pickingFor: number | null;
}>();
const router = useIonRouter();

const page = ref<{ $el: HTMLElement } | null>(null);
const presentingElement = ref<HTMLElement | undefined>();
const favorites = ref<Favorite[]>([]);
const departments = reactive(new Map<number, string>());
const brands = reactive(new Map<number, string>());
const stores = ref<Store[]>([]);
const loaded = ref(false);
const query = ref("");
const picked = reactive(new Set<number>());
const adding = ref(false);
const pickingList = ref<ShoppingList | null>(props.pickingFor ? cachedList(props.pickingFor) ?? null : null);
const editorOpen = ref(false);
const editorKey = ref(0);
const editing = ref<Favorite | null>(null);

const title = computed(() => (props.pickingFor ? `Add to ${pickingList.value?.shoppingListName ?? "List"}` : "Favorites"));
const groups = computed(() => groupByCategory(searchFavorites(favorites.value, query.value, brands)));
const categories = computed(() => categoriesOf(favorites.value));

async function loadFavorites(): Promise<void> {
  favorites.value = await hlist.getFavorites();
}

async function loadCatalog(): Promise<void> {
  const [departmentList, brandList] = await Promise.all([hlist.getDepartments(), hlist.getBrands()]);
  departments.clear();
  for (const department of departmentList) departments.set(department.departmentId, department.departmentName);
  brands.clear();
  for (const brand of brandList) brands.set(brand.brandId, brand.brandName);
}

async function load(): Promise<void> {
  try {
    const [, , storeList, list] = await Promise.all([
      loadFavorites(),
      loadCatalog(),
      hlist.getStores().catch(() => [] as Store[]),
      props.pickingFor ? findList(props.pickingFor) : Promise.resolve(null),
    ]);
    stores.value = storeList;
    if (list) pickingList.value = list;
    loaded.value = true;
  } catch (error) {
    await showError(error, "Couldn't Load Favorites");
  }
}

async function refresh(event: RefresherCustomEvent): Promise<void> {
  try {
    await loadFavorites();
  } catch (error) {
    await showError(error, "Couldn't Load Favorites");
  } finally {
    await event.target.complete();
  }
}

function tap(favorite: Favorite): void {
  if (!props.pickingFor) {
    edit(favorite);
  } else if (picked.has(favorite.favoriteId)) {
    picked.delete(favorite.favoriteId);
  } else {
    picked.add(favorite.favoriteId);
  }
}

function edit(favorite: Favorite | null): void {
  editing.value = favorite;
  editorKey.value++;
  editorOpen.value = true;
}

function afterSave(saved: Favorite): void {
  editorOpen.value = false;
  const index = favorites.value.findIndex((favorite) => favorite.favoriteId === saved.favoriteId);
  if (index >= 0) favorites.value.splice(index, 1, saved);
  else favorites.value.push(saved);
}

function afterDelete(): void {
  const deleted = editing.value;
  editorOpen.value = false;
  if (deleted) favorites.value = favorites.value.filter((favorite) => favorite.favoriteId !== deleted.favoriteId);
}

async function remove(favorite: Favorite, event: Event): Promise<void> {
  await (event.target as HTMLElement).closest("ion-item-sliding")?.close();
  const alert = await alertController.create({
    header: "Delete Favorite?",
    message: `${favorite.name} and its prices will be removed from your favorites. Lists keep their items.`,
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: "Delete", role: "destructive" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== "destructive") return;
  const index = favorites.value.indexOf(favorite);
  favorites.value.splice(index, 1);
  try {
    await hlist.deleteFavorite(favorite.favoriteId);
  } catch (error) {
    favorites.value.splice(index, 0, favorite);
    await showError(error, "Couldn't Delete Favorite");
  }
}

/**
 * Offers the open lists, those of the stores that sell it first (cheapest first, with the price), and a new list
 * for each of its stores that has none.
 */
async function chooseList(favorite: Favorite, event: Event): Promise<void> {
  await (event.target as HTMLElement).closest("ion-item-sliding")?.close();
  let lists: ShoppingList[];
  try {
    lists = (await hlist.getLists(0, 50)).content;
    rememberLists(lists);
  } catch (error) {
    await showError(error, "Couldn't Load Lists");
    return;
  }
  const choices = listChoices(favorite, lists);
  const storesWithLists = new Set(choices.flatMap((choice) => (choice.store ? [choice.store.name] : [])));
  const sheet = await actionSheetController.create({
    header: `Add ${favorite.name} to`,
    buttons: [
      ...choices.map((choice) => ({
        text: choice.store?.price != null
          ? `${choice.list.shoppingListName} · ${formatPrice(choice.store.price)}`
          : choice.list.shoppingListName,
        data: { listId: choice.list.shoppingListId },
      })),
      ...favorite.stores.filter((store) => !storesWithLists.has(store.name)).map((store) => ({
        text: `New ${store.name} List${store.price !== null ? ` · ${formatPrice(store.price)}` : ""}`,
        data: { newList: store.name },
      })),
      { text: "Cancel", role: "cancel" },
    ],
  });
  await sheet.present();
  const { data } = await sheet.onDidDismiss<{ listId?: number; newList?: string }>();
  if (!data) return;
  try {
    let list = lists.find((candidate) => candidate.shoppingListId === data.listId);
    if (data.newList) {
      list = await hlist.createList(data.newList);
      rememberLists([list]);
    }
    if (!list) return;
    const result = await hlist.addFavoriteToList(favorite.favoriteId, list.shoppingListId);
    await showAdded([result], list.shoppingListName, favorite.name);
  } catch (error) {
    await showError(error, "Couldn't Add to List");
  }
}

async function showAdded(results: AddedToList[], listName: string, itemName?: string): Promise<void> {
  const added = results.filter((result) => result.outcome !== "already_on_list").length;
  const message = itemName
    ? results[0].outcome === "already_on_list" ? `${itemName} is already on ${listName}` : `Added ${itemName} to ${listName}`
    : added === results.length ? `Added ${added} to ${listName}`
      : `Added ${added} to ${listName}; ${results.length - added} already there`;
  const toast = await toastController.create({ message, duration: 2000, position: "top" });
  await toast.present();
}

async function addPicked(): Promise<void> {
  if (!props.pickingFor || picked.size === 0) return;
  adding.value = true;
  try {
    const results: AddedToList[] = [];
    for (const favoriteId of picked) results.push(await hlist.addFavoriteToList(favoriteId, props.pickingFor));
    await showAdded(results, pickingList.value?.shoppingListName ?? "the list");
    router.navigate(`/lists/${props.pickingFor}`, "back", "pop");
  } catch (error) {
    await showError(error, "Couldn't Add to List");
  } finally {
    adding.value = false;
  }
}

const reloadFavorites = debounced(loadFavorites);
const reloadCatalog = debounced(loadCatalog);
let stopLiveUpdates: () => void = () => {};

onMounted(() => {
  presentingElement.value = page.value?.$el;
  stopLiveUpdates = subscribe((event) => {
    if (event.type === "favorites" || event.type === "resume") reloadFavorites();
    if (event.type === "catalog" || event.type === "resume") reloadCatalog();
  });
});

onUnmounted(() => stopLiveUpdates());

onIonViewWillEnter(() => {
  void load();
});
</script>

<style scoped>
.thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 6px 14px 6px 0;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.12);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb.empty ion-icon {
  color: var(--hlist-separator);
  font-size: 22px;
}

.check {
  display: grid;
  place-items: center;
  width: 32px;
  margin: 0 6px 0 -6px;
  color: var(--hlist-separator);
  font-size: 26px;
}

.check.checked {
  color: var(--ion-color-primary);
}

h3 {
  margin: 0;
  overflow: hidden;
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-action {
  font-size: 17px;
  font-weight: 600;
}

.bar-action ion-icon {
  font-size: 24px;
}

.bottom-space {
  height: 24px;
}
</style>

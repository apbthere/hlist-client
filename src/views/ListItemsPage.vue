<template>
  <ion-page ref="page">
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/lists" text="Lists" />
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="List options" @click="showOptions">
            <ion-icon slot="icon-only" :icon="ellipsisHorizontalCircleOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ title }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <p v-if="createdOn || titleStoreIcon" class="list-date">
        <img v-if="titleStoreIcon" class="title-store-icon" :src="titleStoreIcon" :alt="list?.store?.name" @error="titleIconFailed = true" />
        {{ createdOn }}
      </p>

      <ion-refresher slot="fixed" @ion-refresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!loaded" class="centered-spinner"><ion-spinner /></div>

      <div v-else-if="items.length === 0" class="empty-state">
        <ion-icon :icon="basketOutline" />
        <h2>Nothing to Buy</h2>
        <p>Tap New Item to add something to this list.</p>
      </div>

      <template v-else>
        <div v-if="activeGroups.length === 0" class="all-done">
          <ion-icon :icon="checkmarkCircle" />
          <span>All done!</span>
        </div>

        <template v-for="group in activeGroups" :key="group.departmentId ?? 'other'">
          <div class="section-header">
            <span>{{ group.title }}</span>
            <span class="to-buy" :class="{ done: countToBuy(group.items) === 0 }">{{ toBuyLabel(group.items) }}</span>
          </div>
          <ion-list :inset="true">
            <item-row
              v-for="item in group.items"
              :key="item.itemId"
              :item="item"
              :checked="item.completed"
              :detail="describe(item)"
              @toggle="toggle(item, $event)"
              @edit="edit(item)"
              @remove="remove(item, $event)"
            />
          </ion-list>
        </template>

        <template v-if="completedItems.length">
          <div class="section-header">
            <span>Completed ({{ completedItems.length }})</span>
            <ion-button fill="clear" size="small" @click="toggleShowCompleted">
              {{ showCompleted ? "Hide" : "Show" }}
            </ion-button>
          </div>
          <ion-list v-if="showCompleted" :inset="true">
            <item-row
              v-for="item in completedItems"
              :key="item.itemId"
              :item="item"
              :checked="true"
              :detail="describe(item)"
              @toggle="toggle(item, $event)"
              @edit="edit(item)"
              @remove="remove(item, $event)"
            />
          </ion-list>
        </template>
        <div class="bottom-space" />
      </template>
    </ion-content>

    <ion-footer :translucent="true" class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button class="bar-action" :disabled="!loaded || !list" @click="add">
            <ion-icon slot="start" :icon="addCircle" />
            New Item
          </ion-button>
        </ion-buttons>
        <span v-if="loaded && items.length" slot="end" class="remaining">{{ remainingLabel }}</span>
      </ion-toolbar>
    </ion-footer>

    <ion-modal :is-open="editorOpen" :presenting-element="presentingElement" @did-dismiss="editorOpen = false">
      <item-editor-sheet
        :key="editorKey"
        :list-id="listId"
        :item="editing ?? undefined"
        :list-items="items"
        :previous-items="previousItems"
        :departments="departments"
        :brands="brands"
        @close="editorOpen = false"
        @saved="afterSave"
      />
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonList, IonModal, IonPage,
  IonRefresher, IonRefresherContent, IonSpinner, IonTitle, IonToolbar, actionSheetController, alertController,
  onIonViewWillEnter, useIonRouter,
} from "@ionic/vue";
import type { RefresherCustomEvent } from "@ionic/vue";
import { addCircle, basketOutline, checkmarkCircle, ellipsisHorizontalCircleOutline } from "ionicons/icons";
import * as hlist from "../api/hlist";
import type { Item, ListItem, ShoppingList } from "../api/types";
import ItemEditorSheet from "../components/ItemEditorSheet.vue";
import ItemRow from "../components/ItemRow.vue";
import { showError } from "../lib/feedback";
import { formatDate } from "../lib/format";
import { storeIconUrl } from "../lib/stores";
import { countToBuy, groupByDepartment } from "../lib/items";
import { cachedList, findList, forgetList } from "../lib/listCache";
import { debounced, subscribe } from "../lib/live";

/** How long a just-checked item stays in place before moving to Completed, as in Reminders. */
const SETTLE_MS = 900;
const SHOW_COMPLETED_KEY = "hlist.showCompleted";

const props = defineProps<{ listId: number }>();
const router = useIonRouter();

const page = ref<{ $el: HTMLElement } | null>(null);
const presentingElement = ref<HTMLElement | undefined>();
const list = ref<ShoppingList | null>(cachedList(props.listId) ?? null);
const items = ref<ListItem[]>([]);
const previousItems = ref<Item[]>([]);
const departments = reactive(new Map<number, string>());
const brands = reactive(new Map<number, string>());
const loaded = ref(false);
const settling = reactive(new Set<number>());
const showCompleted = ref(readShowCompleted());
const editorOpen = ref(false);
const editorKey = ref(0);
const editing = ref<ListItem | null>(null);

const title = computed(() => list.value?.shoppingListName ?? "List");
const createdOn = computed(() => formatDate(list.value?.createdAt));
const titleIconFailed = ref(false);
const titleStoreIcon = computed(() => (titleIconFailed.value ? null : storeIconUrl(list.value?.store)));
const activeGroups = computed(() => groupByDepartment(
  items.value.filter((item) => !item.completed || settling.has(item.itemId)),
  departments,
));
const completedItems = computed(() => items.value
  .filter((item) => item.completed && !settling.has(item.itemId))
  .sort((first, second) => first.itemName.localeCompare(second.itemName)));
const remainingLabel = computed(() => {
  const remaining = countToBuy(items.value);
  return remaining === 0 ? "All done" : `${remaining} to buy`;
});

/** A department's heading count; "Done" while its last item settles before moving to Completed. */
function toBuyLabel(departmentItems: ListItem[]): string {
  const remaining = countToBuy(departmentItems);
  return remaining === 0 ? "Done" : `${remaining} to buy`;
}

function readShowCompleted(): boolean {
  try {
    return localStorage.getItem(SHOW_COMPLETED_KEY) !== "false";
  } catch {
    return true;
  }
}

function toggleShowCompleted(): void {
  showCompleted.value = !showCompleted.value;
  try {
    localStorage.setItem(SHOW_COMPLETED_KEY, String(showCompleted.value));
  } catch {
    // Storage unavailable (private mode); the preference just isn't remembered.
  }
}

function describe(item: ListItem): string {
  return [item.brandId !== null ? brands.get(item.brandId) : undefined, item.itemComment]
    .filter(Boolean)
    .join(" · ");
}

async function loadItems(): Promise<void> {
  items.value = await hlist.getListItems(props.listId);
  const known = new Set(previousItems.value.map((item) => item.itemId));
  for (const item of items.value) if (!known.has(item.itemId)) previousItems.value.push(item);
}

async function load(): Promise<void> {
  try {
    const [found, , departmentList, brandList, previous] = await Promise.all([
      findList(props.listId),
      loadItems(),
      hlist.getDepartments(),
      hlist.getBrands(),
      hlist.getPreviousItems().catch(() => [] as Item[]),
    ]);
    departments.clear();
    for (const department of departmentList) departments.set(department.departmentId, department.departmentName);
    brands.clear();
    for (const brand of brandList) brands.set(brand.brandId, brand.brandName);
    const onList = new Set(items.value.map((item) => item.itemId));
    previousItems.value = [...previous.filter((item) => !onList.has(item.itemId)), ...items.value];
    if (!found) {
      await showError("This list no longer exists.", "List Not Found");
      router.navigate("/lists", "back", "replace");
      return;
    }
    list.value = found;
    loaded.value = true;
  } catch (error) {
    await showError(error, "Couldn't Load List");
  }
}

async function loadCatalog(): Promise<void> {
  const [departmentList, brandList] = await Promise.all([hlist.getDepartments(), hlist.getBrands()]);
  departments.clear();
  for (const department of departmentList) departments.set(department.departmentId, department.departmentName);
  brands.clear();
  for (const brand of brandList) brands.set(brand.brandId, brand.brandName);
}

/** Re-reads this list (e.g. marked done or reopened on another device). */
async function loadList(): Promise<void> {
  forgetList(props.listId);
  const found = await findList(props.listId);
  if (found) list.value = found;
}

// Changes from other devices, each reloaded quietly (no error alerts for background refreshes).
const reloadItems = debounced(loadItems);
const reloadCatalog = debounced(loadCatalog);
const reloadList = debounced(loadList);
let stopLiveUpdates: () => void = () => {};

async function refresh(event: RefresherCustomEvent): Promise<void> {
  try {
    await loadItems();
  } catch (error) {
    await showError(error, "Couldn't Load List");
  } finally {
    await event.target.complete();
  }
}

async function toggle(item: ListItem, sliding?: HTMLIonItemSlidingElement): Promise<void> {
  await sliding?.close();
  const completed = !item.completed;
  item.completed = completed;
  if (completed) {
    settling.add(item.itemId);
    setTimeout(() => settling.delete(item.itemId), SETTLE_MS);
  } else {
    settling.delete(item.itemId);
  }
  try {
    await hlist.setItemCompleted(props.listId, item.itemId, completed);
  } catch (error) {
    item.completed = !completed;
    settling.delete(item.itemId);
    await showError(error, "Couldn't Update Item");
    return;
  }
  if (completed && items.value.every((candidate) => candidate.completed) && list.value && !list.value.completed) {
    await offerToCompleteList();
  }
}

async function offerToCompleteList(): Promise<void> {
  const alert = await alertController.create({
    header: "All Done!",
    message: "Everything on this list is checked off. Mark the list as done?",
    buttons: [
      { text: "Not Now", role: "cancel" },
      { text: "Mark as Done", role: "confirm" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role === "confirm") await setListCompleted(true);
}

async function setListCompleted(completed: boolean): Promise<void> {
  if (!list.value) return;
  try {
    await hlist.setListCompleted(props.listId, completed);
    list.value.completed = completed;
  } catch (error) {
    await showError(error, "Couldn't Update List");
  }
}

async function remove(item: ListItem, sliding?: HTMLIonItemSlidingElement): Promise<void> {
  await sliding?.close();
  const index = items.value.indexOf(item);
  items.value.splice(index, 1);
  try {
    await hlist.removeItem(props.listId, item.itemId);
  } catch (error) {
    items.value.splice(index, 0, item);
    await showError(error, "Couldn't Remove Item");
  }
}

function add(): void {
  editing.value = null;
  editorKey.value++;
  editorOpen.value = true;
}

function edit(item: ListItem): void {
  editing.value = item;
  editorKey.value++;
  editorOpen.value = true;
}

async function afterSave(): Promise<void> {
  editorOpen.value = false;
  try {
    await loadItems();
  } catch (error) {
    await showError(error, "Couldn't Load List");
  }
}

async function showOptions(): Promise<void> {
  const completed = list.value?.completed ?? false;
  const sheet = await actionSheetController.create({
    header: title.value,
    buttons: [
      { text: showCompleted.value ? "Hide Completed Items" : "Show Completed Items", data: "completed-items" },
      { text: completed ? "Reopen List" : "Mark List as Done", data: "list-completion" },
      { text: "Cancel", role: "cancel" },
    ],
  });
  await sheet.present();
  const { data } = await sheet.onDidDismiss<string>();
  if (data === "completed-items") toggleShowCompleted();
  if (data === "list-completion") await setListCompleted(!completed);
}

onMounted(() => {
  presentingElement.value = page.value?.$el;
  stopLiveUpdates = subscribe((event) => {
    if (event.type === "resume") {
      reloadItems();
      reloadCatalog();
      reloadList();
    } else if (event.type === "list-items" && event.listId === props.listId) {
      reloadItems();
    } else if (event.type === "catalog") {
      reloadCatalog();
    } else if (event.type === "lists") {
      reloadList();
    }
  });
});

onUnmounted(() => stopLiveUpdates());

onIonViewWillEnter(() => {
  void load();
});
</script>

<style scoped>
/* A small app-icon-like tile; the padding keeps logos that fill their image (Costco) clear of the corners. */
.title-store-icon {
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  margin-inline-end: 6px;
  padding: 2px;
  vertical-align: -5px;
  border-radius: 6px;
  object-fit: contain;
  background: #ffffff;
}

/* No negative top margin: anything pulled up would slide under the large-title header and be cut off. */
.list-date {
  margin: 0 20px;
  color: var(--hlist-secondary-label);
  font-size: 15px;
}

.all-done {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 24px 16px 0;
  color: var(--ion-color-primary);
  font-size: 17px;
  font-weight: 600;
}

.all-done ion-icon {
  font-size: 26px;
}

.to-buy {
  font-variant-numeric: tabular-nums;
  text-transform: none;
}

.to-buy.done {
  color: var(--ion-color-primary);
  font-weight: 600;
}

.bar-action {
  font-size: 17px;
  font-weight: 600;
}

.bar-action ion-icon {
  font-size: 24px;
}

.remaining {
  padding-inline-end: 16px;
  color: var(--hlist-secondary-label);
  font-size: 13px;
}

.bottom-space {
  height: 24px;
}
</style>

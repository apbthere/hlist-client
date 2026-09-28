<template>
  <ion-page ref="page">
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Lists</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Account" @click="accountOpen = true">
            <ion-icon slot="icon-only" :icon="personCircleOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Lists</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" @ion-refresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="loading && !loaded" class="centered-spinner"><ion-spinner /></div>

      <div v-else-if="loaded && lists.length === 0" class="empty-state">
        <ion-icon :icon="cartOutline" />
        <h2>No Lists Yet</h2>
        <p>Tap New List to start your first shopping list.</p>
      </div>

      <template v-else>
        <template v-if="activeLists.length">
          <div class="section-header">My Lists</div>
          <ion-list :inset="true">
            <ion-item-sliding v-for="list in activeLists" :key="list.shoppingListId">
              <ion-item button :detail="true" @click="open(list)">
                <div slot="start" class="list-badge"><ion-icon :icon="cart" /></div>
                <ion-label>{{ list.shoppingListName }}</ion-label>
              </ion-item>
              <ion-item-options side="end" @ion-swipe="toggleCompleted(list, $event)">
                <ion-item-option color="primary" :expandable="true" @click="toggleCompleted(list, $event)">
                  <ion-icon slot="top" :icon="checkmarkCircle" />
                  Done
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
        </template>

        <template v-if="completedLists.length">
          <div class="section-header">
            <span>Completed</span>
            <ion-button fill="clear" size="small" @click="showCompleted = !showCompleted">
              {{ showCompleted ? "Hide" : `Show (${completedLists.length})` }}
            </ion-button>
          </div>
          <ion-list v-if="showCompleted" :inset="true">
            <ion-item-sliding v-for="list in completedLists" :key="list.shoppingListId">
              <ion-item button :detail="true" @click="open(list)">
                <div slot="start" class="list-badge completed"><ion-icon :icon="checkmark" /></div>
                <ion-label class="completed-label">{{ list.shoppingListName }}</ion-label>
              </ion-item>
              <ion-item-options side="end" @ion-swipe="toggleCompleted(list, $event)">
                <ion-item-option color="warning" :expandable="true" @click="toggleCompleted(list, $event)">
                  <ion-icon slot="top" :icon="arrowUndo" />
                  Reopen
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
        </template>

        <ion-infinite-scroll :disabled="allLoaded" @ion-infinite="loadMore($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </template>
    </ion-content>

    <ion-footer :translucent="true" class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button class="bar-action" @click="newList">
            <ion-icon slot="start" :icon="addCircle" />
            New List
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>

    <ion-modal :is-open="accountOpen" :presenting-element="presentingElement" @did-dismiss="accountOpen = false">
      <account-sheet @close="accountOpen = false" @signed-out="afterSignOut" />
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonInfiniteScroll,
  IonInfiniteScrollContent, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList,
  IonModal, IonPage, IonRefresher, IonRefresherContent, IonSpinner, IonTitle, IonToolbar,
  onIonViewWillEnter, useIonRouter,
} from "@ionic/vue";
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from "@ionic/vue";
import {
  addCircle, arrowUndo, cart, cartOutline, checkmark, checkmarkCircle, personCircleOutline,
} from "ionicons/icons";
import * as hlist from "../api/hlist";
import type { ShoppingList } from "../api/types";
import AccountSheet from "../components/AccountSheet.vue";
import { promptForText, showError } from "../lib/feedback";
import { rememberLists } from "../lib/listCache";

const PAGE_SIZE = 50;
const router = useIonRouter();

const page = ref<{ $el: HTMLElement } | null>(null);
const presentingElement = ref<HTMLElement | undefined>();
const lists = ref<ShoppingList[]>([]);
const nextPage = ref(0);
const allLoaded = ref(false);
const loading = ref(false);
const loaded = ref(false);
const showCompleted = ref(false);
const accountOpen = ref(false);

const activeLists = computed(() => lists.value.filter((list) => !list.completed));
const completedLists = computed(() => lists.value.filter((list) => list.completed));

async function fetchPage(pageNumber: number): Promise<void> {
  const result = await hlist.getLists(pageNumber, PAGE_SIZE);
  rememberLists(result.content);
  const known = new Set(lists.value.map((list) => list.shoppingListId));
  lists.value = pageNumber === 0
    ? result.content
    : [...lists.value, ...result.content.filter((list) => !known.has(list.shoppingListId))];
  nextPage.value = pageNumber + 1;
  allLoaded.value = result.last;
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    await fetchPage(0);
    loaded.value = true;
  } catch (error) {
    await showError(error, "Couldn't Load Lists");
  } finally {
    loading.value = false;
  }
}

async function refresh(event: RefresherCustomEvent): Promise<void> {
  await reload();
  await event.target.complete();
}

async function loadMore(event: InfiniteScrollCustomEvent): Promise<void> {
  try {
    await fetchPage(nextPage.value);
  } catch (error) {
    await showError(error, "Couldn't Load Lists");
  } finally {
    await event.target.complete();
  }
}

function open(list: ShoppingList): void {
  router.push(`/lists/${list.shoppingListId}`);
}

async function toggleCompleted(list: ShoppingList, event: Event): Promise<void> {
  await (event.target as HTMLElement).closest("ion-item-sliding")?.close();
  const completed = !list.completed;
  list.completed = completed;
  try {
    await hlist.setListCompleted(list.shoppingListId, completed);
  } catch (error) {
    list.completed = !completed;
    await showError(error, "Couldn't Update List");
  }
}

async function newList(): Promise<void> {
  const name = await promptForText({
    header: "New List",
    placeholder: "e.g. Weekend Shop",
    confirmText: "Create",
  });
  if (!name) return;
  try {
    const list = await hlist.createList(name);
    rememberLists([list]);
    lists.value = [list, ...lists.value];
    open(list);
  } catch (error) {
    await showError(error, "Couldn't Create List");
  }
}

function afterSignOut(): void {
  accountOpen.value = false;
  router.navigate("/login", "root", "replace");
}

onMounted(() => {
  presentingElement.value = page.value?.$el;
});

// Also runs when navigating back from a list, so completion changes made there show up.
onIonViewWillEnter(() => {
  void reload();
});
</script>

<style scoped>
.list-badge {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-inline-end: 14px;
  border-radius: 50%;
  color: #ffffff;
  background: var(--ion-color-primary);
  font-size: 17px;
}

.list-badge.completed {
  background: var(--hlist-separator);
}

.completed-label {
  color: var(--hlist-secondary-label);
}

.bar-action {
  font-size: 17px;
  font-weight: 600;
}

.bar-action ion-icon {
  font-size: 24px;
}
</style>

<template>
  <!--
    /add: adds the product from a store's web page. The "Add to HList" bookmark (Mac) or Shortcut (iPad) opens it
    with the product's details; it picks the list (the newest open list for that store) and opens its New Item
    sheet filled in. Opened without details, it explains how to set up the bookmark and Shortcut.
  -->
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/lists" text="Lists" />
        </ion-buttons>
        <ion-title>{{ product ? "Add to List" : "Add from Store Websites" }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="product && !loaded" class="centered-spinner"><ion-spinner /></div>

      <template v-else-if="product">
        <ion-list :inset="true" class="product">
          <ion-item lines="none">
            <img v-if="product.photo" slot="start" class="product-photo" :src="product.photo" alt="" referrerpolicy="no-referrer" />
            <ion-label class="ion-text-wrap">
              <h2>{{ product.name }}</h2>
              <p v-if="details">{{ details }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
        <div class="section-header">Add to which list?</div>
        <ion-list v-if="openLists.length" :inset="true">
          <ion-item v-for="list in openLists" :key="list.shoppingListId" button :detail="true" @click="addTo(list)">
            <store-badge slot="start" :store="list.store" />
            <ion-label>{{ list.shoppingListName }} <span class="list-date">{{ formatDate(list.createdAt) }}</span></ion-label>
          </ion-item>
        </ion-list>
        <p v-else class="section-footer">You have no open lists. Create one on the Lists screen first.</p>
      </template>

      <template v-else>
        <div class="section-header">On a Mac</div>
        <ion-list :inset="true">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap setup">
              <p>Show Safari’s Favorites bar (View → Show Favorites Bar), then drag this button onto it:</p>
              <a class="bookmarklet" :href="bookmark" @click.prevent="noteDragOnly">Add to HList</a>
              <p>On a store’s product page, click <strong>Add to HList</strong> in the Favorites bar.</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <div class="section-header">On an iPad or iPhone</div>
        <ion-list :inset="true">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap setup">
              <p>In the Shortcuts app, make a new shortcut named <strong>Add to HList</strong>:</p>
              <ol>
                <li>Tap the shortcut’s ⓘ (or the name at the top), turn on <strong>Show in Share Sheet</strong>, and set it to receive <strong>Safari web pages</strong>.</li>
                <li>Add the action <strong>Run JavaScript on Web Page</strong> and replace its script with the script below.</li>
                <li>Add the action <strong>Open URLs</strong> and give it the <em>JavaScript Result</em>.</li>
              </ol>
              <p>On a store’s product page, tap <strong>Share → Add to HList</strong>. The first time, allow the shortcut to run on that site.</p>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <pre class="script">{{ script }}</pre>
          </ion-item>
          <ion-item button :detail="false" @click="copyScript">
            <ion-label color="primary">{{ copied ? "Copied" : "Copy Script" }}</ion-label>
          </ion-item>
        </ion-list>
        <p class="section-footer">
          On Publix, choose your store on the website first: the product page then shows the store’s section (such as
          Meat), which HList uses as the department.
        </p>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonSpinner, IonTitle,
  IonToolbar, onIonViewWillEnter, useIonRouter,
} from "@ionic/vue";
import * as hlist from "../api/hlist";
import type { ShoppingList } from "../api/types";
import StoreBadge from "../components/StoreBadge.vue";
import { bookmarklet, defaultList, newestFirst, productFromQuery, setPendingProduct, shortcutScript } from "../lib/addFromPage";
import { showError } from "../lib/feedback";
import { formatDate } from "../lib/format";

const route = useRoute();
const router = useIonRouter();
const product = computed(() => productFromQuery(route.query));
const details = computed(() => [product.value?.brand, product.value?.section, product.value?.size].filter(Boolean).join(" · "));
const lists = ref<ShoppingList[]>([]);
const loaded = ref(false);
const openLists = computed(() => newestFirst(lists.value).filter((list) => !list.completed));

const bookmark = computed(() => bookmarklet(window.location.origin));
const script = computed(() => shortcutScript(window.location.origin));
const copied = ref(false);

function addTo(list: ShoppingList): void {
  if (!product.value) return;
  setPendingProduct(list.shoppingListId, product.value);
  router.navigate(`/lists/${list.shoppingListId}`, "forward", "replace");
}

async function load(): Promise<void> {
  if (!product.value) return;
  loaded.value = false;
  try {
    lists.value = (await hlist.getLists(0, 100)).content;
  } catch (error) {
    await showError(error, "Couldn't Load Lists");
    return;
  } finally {
    loaded.value = true;
  }
  const list = defaultList(lists.value, product.value);
  if (list) addTo(list);
}

async function copyScript(): Promise<void> {
  try {
    await navigator.clipboard.writeText(script.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    await showError("Select the script and copy it instead.", "Couldn't Copy");
  }
}

async function noteDragOnly(): Promise<void> {
  await showError("Drag the button to Safari’s Favorites bar instead of clicking it here.", "Add to HList");
}

onIonViewWillEnter(() => void load());
</script>

<style scoped>
.product-photo {
  width: 64px;
  height: 64px;
  margin: 10px 14px 10px 0;
  border-radius: 10px;
  object-fit: contain;
  background: #ffffff;
}

.product h2 {
  font-size: 17px;
  font-weight: 600;
}

.list-date {
  margin-left: 6px;
  color: var(--hlist-secondary-label);
  font-size: 15px;
}

.setup p,
.setup li {
  color: var(--ion-text-color);
  font-size: 15px;
  line-height: 1.4;
}

.setup ol {
  margin: 8px 0;
  padding-left: 22px;
}

.bookmarklet {
  display: inline-block;
  margin: 10px 0;
  padding: 8px 16px;
  border-radius: 10px;
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
}

.script {
  width: 100%;
  max-height: 140px;
  margin: 0 0 8px;
  padding: 10px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.12);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: all;
  -webkit-user-select: all;
}
</style>

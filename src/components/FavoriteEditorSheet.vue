<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="emit('close')">Cancel</ion-button>
      </ion-buttons>
      <ion-title>{{ favorite ? "Edit Favorite" : "New Favorite" }}</ion-title>
      <ion-buttons slot="end">
        <ion-button :strong="true" :disabled="!canSave || busy" @click="save">{{ favorite ? "Save" : "Add" }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @submit.prevent="save">
      <ion-list :inset="true" class="first-group">
        <ion-item>
          <ion-input
            v-model="name"
            aria-label="Name"
            :placeholder="namePending ? 'Getting the product…' : 'e.g. Whole Bean Coffee'"
            autocapitalize="sentences"
            autocomplete="off"
            enterkeyhint="done"
            :maxlength="255"
            :clear-input="true"
            @paste="onNamePaste"
          />
        </ion-item>
      </ion-list>
      <p v-if="!favorite && photoId === null && !photoBusy" class="section-footer">
        Tip: paste a product’s link into the name to fill in its name, brand and photo.
      </p>

      <div class="section-header">Photo</div>
      <ion-list :inset="true">
        <ion-item v-if="photoId !== null || photoBusy">
          <div class="photo-thumb">
            <ion-spinner v-if="photoBusy" name="crescent" />
            <img v-else :src="photoPreview ?? thumbnailUrl(photoId!)" alt="" />
          </div>
          <ion-label class="photo-hint">{{ photoBusy ? "Adding photo…" : "Items added from this favorite show this photo" }}</ion-label>
        </ion-item>
        <ion-item button :detail="false" :disabled="photoBusy" @click="choosePhoto">
          <ion-icon slot="start" :icon="cameraOutline" color="primary" />
          <ion-label color="primary">{{ photoId !== null ? "Replace Photo" : "Add Photo" }}</ion-label>
        </ion-item>
        <ion-item v-if="photoId !== null && !photoBusy" button :detail="false" @click="removePhoto">
          <ion-icon slot="start" :icon="trashOutline" color="danger" />
          <ion-label color="danger">Remove Photo</ion-label>
        </ion-item>
      </ion-list>
      <input ref="cameraInput" class="file-input" type="file" accept="image/*" capture="environment" @change="onFileChosen" />
      <input ref="libraryInput" class="file-input" type="file" accept="image/*" @change="onFileChosen" />

      <div class="section-header">Details</div>
      <ion-list :inset="true">
        <ion-item>
          <ion-select
            label="Category"
            interface="action-sheet"
            :interface-options="{ header: 'Category' }"
            :value="category ?? 'none'"
            @ion-change="chooseCategory($event)"
          >
            <ion-select-option value="new">New Category…</ion-select-option>
            <ion-select-option value="none">None</ion-select-option>
            <ion-select-option v-for="known in categoryOptions" :key="known" :value="known">{{ known }}</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            label="Brand"
            interface="action-sheet"
            :interface-options="{ header: 'Brand' }"
            :value="brandId === null ? 'none' : String(brandId)"
            @ion-change="chooseCatalog('brand', $event)"
          >
            <ion-select-option value="new">New Brand…</ion-select-option>
            <ion-select-option value="none">None</ion-select-option>
            <ion-select-option v-for="[id, label] in sortedBrands" :key="id" :value="String(id)">{{ label }}</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            label="Department"
            interface="action-sheet"
            :interface-options="{ header: 'Department' }"
            :value="departmentId === null ? 'none' : String(departmentId)"
            @ion-change="chooseCatalog('department', $event)"
          >
            <ion-select-option value="new">New Department…</ion-select-option>
            <ion-select-option value="none">None</ion-select-option>
            <ion-select-option v-for="[id, label] in sortedDepartments" :key="id" :value="String(id)">{{ label }}</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>
      <p class="section-footer">The department is where it goes on a shopping list.</p>

      <div class="section-header">Where to Buy</div>
      <ion-list :inset="true">
        <ion-item v-for="(store, index) in storeRows" :key="store.name" button :detail="false" @click="editStore(index)">
          <ion-label>
            <h3>{{ store.name }}</h3>
            <p v-if="store.size || store.priceCheckedAt">
              {{ [store.size, store.priceCheckedAt ? `seen ${formatDate(store.priceCheckedAt)}` : null].filter(Boolean).join(" · ") }}
            </p>
          </ion-label>
          <span slot="end" class="price" :class="{ missing: store.price === null }">
            {{ store.price === null ? "Add price" : formatPrice(store.price) }}
          </span>
        </ion-item>
        <ion-item button :detail="false" @click="addStore">
          <ion-icon slot="start" :icon="addCircleOutline" color="primary" />
          <ion-label color="primary">Add Store</ion-label>
        </ion-item>
      </ion-list>
      <p class="section-footer">An AI assistant connected to HList checks and records these prices before it adds a favorite to a list.</p>

      <div class="section-header">Notes</div>
      <ion-list :inset="true">
        <ion-item>
          <ion-textarea v-model="comment" aria-label="Notes" placeholder="e.g. Medium roast, 2 lb bag" :auto-grow="true" :maxlength="1000" />
        </ion-item>
      </ion-list>

      <ion-list v-if="favorite" :inset="true" class="delete-group">
        <ion-item button :detail="false" @click="remove">
          <ion-label color="danger" class="centered">Delete Favorite</ion-label>
        </ion-item>
      </ion-list>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSelect,
  IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar, actionSheetController, alertController,
} from "@ionic/vue";
import { addCircleOutline, cameraOutline, trashOutline } from "ionicons/icons";
import * as hlist from "../api/hlist";
import type { Favorite, FavoriteRequest, FavoriteStore, Store } from "../api/types";
import { promptForText, showError } from "../lib/feedback";
import { formatDate } from "../lib/format";
import { formatPrice } from "../lib/favorites";
import { capitalizeWords, findCatalogMatch } from "../lib/items";
import { pastedLinkOnly, pictureFromPaste, prepareForUpload, thumbnailUrl } from "../lib/photos";

type CatalogType = "department" | "brand";

const props = defineProps<{
  /** The favorite being edited; omitted when adding. */
  favorite?: Favorite;
  departments: Map<number, string>;
  brands: Map<number, string>;
  /** The user's categories, most used first. */
  categories: string[];
  /** The stores HList knows, offered under Add Store. */
  stores: Store[];
}>();

const emit = defineEmits<{ close: []; saved: [favorite: Favorite]; deleted: [] }>();

const name = ref(props.favorite?.name ?? "");
const category = ref<string | null>(props.favorite?.category ?? null);
const brandId = ref<number | null>(props.favorite?.brandId ?? null);
const departmentId = ref<number | null>(props.favorite?.departmentId ?? null);
const comment = ref(props.favorite?.comment ?? "");
const photoId = ref<number | null>(props.favorite?.photoId ?? null);
const photoPreview = ref<string | null>(null);
const photoBusy = ref(false);
const namePending = ref(false);
const busy = ref(false);
const storeRows = ref<FavoriteStore[]>((props.favorite?.stores ?? []).map((store) => ({ ...store })));
const cameraInput = ref<HTMLInputElement | null>(null);
const libraryInput = ref<HTMLInputElement | null>(null);
/** Categories added in this sheet, offered with the others. */
const newCategories = ref<string[]>([]);

const canSave = computed(() => name.value.trim() !== "" && !photoBusy.value);
const byLabel = (entries: Map<number, string>) =>
  [...entries.entries()].sort((first, second) => first[1].localeCompare(second[1], undefined, { sensitivity: "base" }));
const sortedBrands = computed(() => byLabel(props.brands));
const sortedDepartments = computed(() => byLabel(props.departments));
const categoryOptions = computed(() => [...new Set([...newCategories.value, ...props.categories,
  ...(category.value ? [category.value] : [])])]);

// ---- Photo ----

async function choosePhoto(): Promise<void> {
  // The file pickers must be opened right from the tap, so the handlers don't await first.
  const sheet = await actionSheetController.create({
    header: "Photo",
    buttons: [
      { text: "Take Photo", handler: () => { cameraInput.value?.click(); } },
      { text: "Choose from Photos", handler: () => { libraryInput.value?.click(); } },
      { text: "Cancel", role: "cancel" },
    ],
  });
  await sheet.present();
}

function onFileChosen(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void usePicture(file);
}

async function usePicture(picture: Blob): Promise<void> {
  photoBusy.value = true;
  try {
    const prepared = await prepareForUpload(picture);
    const uploaded = await hlist.uploadPhoto(prepared);
    setPreview(URL.createObjectURL(prepared));
    photoId.value = uploaded.photoId;
  } catch (error) {
    await showError(error, "Couldn't Add Photo");
  } finally {
    photoBusy.value = false;
  }
}

function setPreview(url: string | null): void {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = url;
}

function removePhoto(): void {
  photoId.value = null;
  setPreview(null);
}

/** A pasted product link fills in the photo and, when empty, the name and brand. Ordinary text pastes as usual. */
function onNamePaste(event: ClipboardEvent): void {
  const picture = pictureFromPaste(event);
  const link = picture ? null : pastedLinkOnly(event);
  if (!picture && !link) return;
  event.preventDefault();
  if (picture) void usePicture(picture);
  else if (link) void importFromLink(link);
}

async function importFromLink(link: string): Promise<void> {
  const nameFromPage = name.value.trim() === "";
  photoBusy.value = true;
  namePending.value = nameFromPage;
  try {
    const imported = await hlist.importPhoto(link);
    setPreview(null);
    photoId.value = imported.photoId;
    if (nameFromPage && imported.title && name.value.trim() === "") name.value = imported.title;
    if (imported.brand && brandId.value === null) brandId.value = await resolveCatalog("brand", imported.brand);
    const store = storeForLink(link);
    if (store && !storeRows.value.some((row) => row.name === store.name)) {
      storeRows.value.push({ name: store.name, key: store.key, price: null, size: null, productUrl: link, priceCheckedAt: null });
    }
  } catch (error) {
    await showError(error, "Couldn't Add Photo");
  } finally {
    photoBusy.value = false;
    namePending.value = false;
  }
}

/** The store whose website the link is on, e.g. Costco for costco.com product pages. */
function storeForLink(link: string): Store | undefined {
  let host: string;
  try {
    host = new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
  return props.stores.find((store) => store.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
}

// ---- Category, brand and department ----

async function chooseCategory(event: CustomEvent<{ value: string }>): Promise<void> {
  const choice = event.detail.value;
  if (choice === "none") {
    category.value = null;
  } else if (choice === "new") {
    (event.target as HTMLIonSelectElement).value = category.value ?? "none";
    const label = await promptForText({ header: "New Category", placeholder: "e.g. Coffee", confirmText: "Add" });
    if (!label) return;
    const existing = categoryOptions.value.find((known) => known.toLowerCase() === label.toLowerCase());
    const chosen = existing ?? capitalizeWords(label);
    if (!existing) newCategories.value.push(chosen);
    category.value = chosen;
  } else {
    category.value = choice;
  }
}

function catalog(type: CatalogType): Map<number, string> {
  return type === "brand" ? props.brands : props.departments;
}

/** Finds a department or brand by sounds-alike name, creating it when there is no match. */
async function resolveCatalog(type: CatalogType, label: string): Promise<number> {
  const existing = findCatalogMatch(catalog(type), label);
  if (existing !== null) return existing;
  const displayName = capitalizeWords(label);
  if (type === "brand") {
    const brand = await hlist.createBrand(displayName);
    props.brands.set(brand.brandId, brand.brandName);
    return brand.brandId;
  }
  const department = await hlist.createDepartment(displayName);
  props.departments.set(department.departmentId, department.departmentName);
  return department.departmentId;
}

async function chooseCatalog(type: CatalogType, event: CustomEvent<{ value: string }>): Promise<void> {
  const target = type === "brand" ? brandId : departmentId;
  const choice = event.detail.value;
  if (choice === "none") {
    target.value = null;
  } else if (choice === "new") {
    (event.target as HTMLIonSelectElement).value = target.value === null ? "none" : String(target.value);
    const label = await promptForText({
      header: type === "brand" ? "New Brand" : "New Department",
      placeholder: type === "brand" ? "e.g. Lavazza" : "e.g. Beverages",
      confirmText: "Add",
    });
    if (!label) return;
    try {
      target.value = await resolveCatalog(type, label);
    } catch (error) {
      await showError(error, type === "brand" ? "Couldn't Add Brand" : "Couldn't Add Department");
    }
  } else {
    target.value = Number(choice);
  }
}

// ---- Stores ----

async function addStore(): Promise<void> {
  const taken = new Set(storeRows.value.map((store) => store.name));
  const sheet = await actionSheetController.create({
    header: "Add Store",
    buttons: [
      ...props.stores.filter((store) => !taken.has(store.name)).map((store) => ({ text: store.name, data: store.name })),
      { text: "Other Store…", data: "other" },
      { text: "Cancel", role: "cancel" },
    ],
  });
  await sheet.present();
  const { data } = await sheet.onDidDismiss<string>();
  if (!data) return;
  let storeName: string | null = data;
  if (data === "other") {
    storeName = await promptForText({ header: "Other Store", placeholder: "e.g. Total Wine", confirmText: "Add" });
    if (!storeName) return;
    storeName = capitalizeWords(storeName);
    const known = props.stores.find((store) => store.name.toLowerCase() === storeName!.toLowerCase());
    if (known) storeName = known.name;
    if (storeRows.value.some((store) => store.name.toLowerCase() === storeName!.toLowerCase())) return;
  }
  const key = props.stores.find((store) => store.name === storeName)?.key ?? null;
  storeRows.value.push({ name: storeName, key, price: null, size: null, productUrl: null, priceCheckedAt: null });
  await editStore(storeRows.value.length - 1);
}

/** Asks for the price there and what it's for; Remove takes the store off. */
async function editStore(index: number): Promise<void> {
  const store = storeRows.value[index];
  const alert = await alertController.create({
    header: store.name,
    message: "The price there, and what it’s for.",
    inputs: [
      {
        name: "price", type: "number", placeholder: "Price, e.g. 12.99", value: store.price ?? "",
        attributes: { inputmode: "decimal", min: 0, step: "0.01" },
      },
      { name: "size", type: "text", placeholder: "Size, e.g. 2 lb bag", value: store.size ?? "", attributes: { maxlength: 100 } },
    ],
    buttons: [
      { text: "Remove Store", role: "destructive" },
      { text: "Cancel", role: "cancel" },
      { text: "Save", role: "confirm" },
    ],
  });
  await alert.present();
  const { data, role } = await alert.onDidDismiss<{ values: { price: string; size: string } }>();
  if (role === "destructive") {
    storeRows.value.splice(index, 1);
  } else if (role === "confirm" && data) {
    const price = Number.parseFloat(String(data.values.price).replace(/[$,\s]/g, ""));
    const newPrice = Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null;
    if (newPrice !== store.price) store.priceCheckedAt = newPrice === null ? null : new Date().toISOString();
    store.price = newPrice;
    store.size = data.values.size.trim() || null;
  }
}

// ---- Saving ----

function requestBody(): FavoriteRequest {
  return {
    name: name.value.trim(),
    brandId: brandId.value,
    departmentId: departmentId.value,
    category: category.value,
    comment: comment.value.trim() || null,
    photoId: photoId.value,
    stores: storeRows.value.map((store) => ({
      name: store.name, price: store.price, size: store.size, productUrl: store.productUrl,
    })),
  };
}

async function save(): Promise<void> {
  if (!canSave.value || busy.value) return;
  busy.value = true;
  try {
    const saved = props.favorite
      ? await hlist.updateFavorite(props.favorite.favoriteId, requestBody())
      : await hlist.createFavorite(requestBody());
    emit("saved", saved);
  } catch (error) {
    await showError(error, "Couldn't Save Favorite");
  } finally {
    busy.value = false;
  }
}

async function remove(): Promise<void> {
  if (!props.favorite) return;
  const alert = await alertController.create({
    header: "Delete Favorite?",
    message: `${props.favorite.name} and its prices will be removed from your favorites. Lists keep their items.`,
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: "Delete", role: "destructive" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== "destructive") return;
  try {
    await hlist.deleteFavorite(props.favorite.favoriteId);
    emit("deleted");
  } catch (error) {
    await showError(error, "Couldn't Delete Favorite");
  }
}
</script>

<style scoped>
.first-group {
  margin-top: 20px;
}

.photo-thumb {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 8px 14px 8px 0;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(118, 118, 128, 0.12);
}

.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-hint {
  color: var(--hlist-secondary-label);
  font-size: 15px;
}

/* Hidden but still clickable from code (display:none file inputs are ignored by some browsers). */
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.price {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.price.missing {
  color: var(--ion-color-primary);
  font-size: 15px;
}

.delete-group {
  margin-top: 32px;
}

.centered {
  text-align: center;
}
</style>

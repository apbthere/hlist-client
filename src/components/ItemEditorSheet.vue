<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="emit('close')">Cancel</ion-button>
      </ion-buttons>
      <ion-title>{{ item ? "Edit Item" : "New Item" }}</ion-title>
      <ion-buttons slot="end">
        <ion-button :strong="true" :disabled="!canSave || busy" @click="save">{{ item ? "Save" : "Add" }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <!-- A tap anywhere outside the name field and its suggestions counts as leaving the name. -->
    <form @submit.prevent="save" @pointerdown.capture="onPointerDown">
      <ion-list :inset="true" class="first-group">
        <ion-item class="name-item">
          <ion-input
            ref="nameInput"
            v-model="name"
            aria-label="Item name"
            :placeholder="namePending ? 'Getting the product…' : 'e.g. Milk by Horizon in Dairy'"
            autocapitalize="sentences"
            autocomplete="off"
            enterkeyhint="done"
            :maxlength="255"
            :clear-input="true"
            @ion-focus="enterName()"
            @ion-input="enterName(true)"
            @ion-blur="scheduleLeaveName()"
            @paste="onNamePaste"
          />
        </ion-item>
        <ion-item v-if="patternPreview" class="pattern-preview" lines="none">
          <ion-icon slot="start" :icon="sparkles" color="primary" />
          <ion-label>
            <h3>{{ patternPreview.itemName }}</h3>
            <p>
              <span v-if="patternPreview.brand">Brand: {{ patternPreview.brand.label }}<span v-if="patternPreview.brand.isNew" class="new-badge">New</span></span>
              <span v-if="patternPreview.brand && patternPreview.department"> · </span>
              <span v-if="patternPreview.department">Department: {{ patternPreview.department.label }}<span v-if="patternPreview.department.isNew" class="new-badge">New</span></span>
            </p>
          </ion-label>
        </ion-item>
      </ion-list>

      <template v-if="suggestions.length">
        <div class="section-header">Suggestions</div>
        <ion-list :inset="true" class="suggestions-list">
          <ion-item v-for="suggestion in suggestions" :key="suggestion.itemId" button :detail="false" @click="useSuggestion(suggestion)">
            <ion-icon slot="start" :icon="timeOutline" class="suggestion-icon" />
            <ion-label>
              <h3>{{ suggestion.itemName }}</h3>
              <p>{{ describe(suggestion.departmentId, suggestion.brandId) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </template>

      <div class="section-header">Photo</div>
      <ion-list :inset="true">
        <ion-item v-if="photoId !== null || photoBusy">
          <button type="button" class="photo-thumb" :disabled="photoBusy" aria-label="Show photo full screen" @click="viewerOpen = true">
            <ion-spinner v-if="photoBusy" name="crescent" />
            <img v-else :src="photoPreview ?? thumbnailUrl(photoId!)" alt="" />
          </button>
          <ion-label class="photo-hint">{{ photoBusy ? "Adding photo…" : "Tap the photo to see it full screen" }}</ion-label>
        </ion-item>
        <ion-item v-if="pasteBoxOpen" class="paste-item">
          <!-- Long-press → Paste works on any page; inputmode="none" keeps the keyboard away. -->
          <div
            ref="pasteBox"
            class="paste-box"
            contenteditable="true"
            inputmode="none"
            role="textbox"
            aria-label="Paste the picture here"
            data-placeholder="Touch and hold here, then tap Paste"
            @paste.prevent="onPaste"
            @beforeinput.prevent
            @drop.prevent
          />
          <ion-button slot="end" fill="clear" @click="pasteBoxOpen = false">Cancel</ion-button>
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
          <ion-label>Quantity</ion-label>
          <div slot="end" class="stepper">
            <button type="button" aria-label="Decrease quantity" :disabled="quantity <= 1" @click="quantity--">
              <ion-icon :icon="remove" />
            </button>
            <span class="stepper-value" aria-live="polite">{{ quantity }}</span>
            <button type="button" aria-label="Increase quantity" @click="quantity++">
              <ion-icon :icon="add" />
            </button>
          </div>
        </ion-item>
        <ion-item>
          <ion-select
            label="Department"
            interface="action-sheet"
            :interface-options="{ header: 'Department' }"
            :value="departmentChoice"
            @ion-change="chooseCatalog('department', $event)"
          >
            <ion-select-option value="none">None</ion-select-option>
            <ion-select-option v-for="[id, label] in sortedDepartments" :key="id" :value="String(id)">{{ label }}</ion-select-option>
            <ion-select-option value="new">New Department…</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            label="Brand"
            interface="action-sheet"
            :interface-options="{ header: 'Brand' }"
            :value="brandChoice"
            @ion-change="chooseCatalog('brand', $event)"
          >
            <ion-select-option value="none">None</ion-select-option>
            <ion-select-option v-for="[id, label] in sortedBrands" :key="id" :value="String(id)">{{ label }}</ion-select-option>
            <ion-select-option value="new">New Brand…</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <div class="section-header">Notes</div>
      <ion-list :inset="true">
        <ion-item>
          <ion-textarea v-model="comment" aria-label="Notes" placeholder="e.g. Unsweetened, family size" :auto-grow="true" :maxlength="1000" />
        </ion-item>
      </ion-list>
      <p v-if="!item" class="section-footer">Tip: type “Milk by Horizon in Dairy” to fill in the brand and department, or just “Milk by Horizon” or “Milk in Dairy”. Or paste a product’s link (Share → Copy on the store’s page) to fill in its name, brand and photo.</p>
    </form>
  </ion-content>

  <ion-modal :is-open="viewerOpen" class="photo-viewer-modal" @did-dismiss="viewerOpen = false">
    <photo-viewer v-if="viewerOpen && photoId !== null" :src="photoPreview ?? photoUrl(photoId)" :title="name.trim() || undefined" @close="viewerOpen = false" />
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSelect,
  IonModal, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar, actionSheetController, alertController,
} from "@ionic/vue";
import { add, cameraOutline, remove, sparkles, timeOutline, trashOutline } from "ionicons/icons";
import * as hlist from "../api/hlist";
import type { Item, ItemRequest, ListItem } from "../api/types";
import PhotoViewer from "./PhotoViewer.vue";
import { promptForText, showError } from "../lib/feedback";
import {
  canReadClipboard, linkFromPaste, pastedLinkOnly, photoUrl, pictureFromPaste, prepareForUpload, readClipboardLink, readClipboardPicture,
  thumbnailUrl, webAddressIn,
} from "../lib/photos";
import { capitalizeWords, findCatalogMatch, normalizeItemName, parseItemPattern, suggestItems } from "../lib/items";

type CatalogType = "department" | "brand";

const props = defineProps<{
  listId: number;
  /** The item being edited; omitted when adding. */
  item?: ListItem;
  /** Items already on the list, for duplicate detection. */
  listItems: ListItem[];
  previousItems: Item[];
  /** Shared with the list screen; new entries are added in place. */
  departments: Map<number, string>;
  brands: Map<number, string>;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const nameInput = ref<{ $el: HTMLIonInputElement } | null>(null);
const name = ref(props.item?.itemName ?? "");
const quantity = ref(props.item?.quantity ?? 1);
const departmentId = ref<number | null>(props.item?.departmentId ?? null);
const brandId = ref<number | null>(props.item?.brandId ?? null);
const comment = ref(props.item?.itemComment ?? "");

// Photo: uploaded as soon as it's chosen, attached to the item when it's saved (see applyPhoto).
const initialPhotoId = props.item?.photoId ?? null;
const photoId = ref<number | null>(initialPhotoId);
/** A local copy of a just-chosen picture, shown until the item is saved. */
const photoPreview = ref<string | null>(null);
const photoBusy = ref(false);
const viewerOpen = ref(false);
const cameraInput = ref<HTMLInputElement | null>(null);
const libraryInput = ref<HTMLInputElement | null>(null);
const pasteBox = ref<HTMLElement | null>(null);
const pasteBoxOpen = ref(false);
/** Whether the name is being fetched from a pasted product link. */
const namePending = ref(false);

function setPreview(url: string | null): void {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = url;
}

async function choosePhoto(): Promise<void> {
  // The file pickers and the clipboard must be opened right from the tap, so handlers don't await first.
  const sheet = await actionSheetController.create({
    header: "Item Photo",
    buttons: [
      { text: "Take Photo", handler: () => { cameraInput.value?.click(); } },
      { text: "Choose from Photos", handler: () => { libraryInput.value?.click(); } },
      { text: "Paste Image", handler: () => { void pastePhoto(); } },
      { text: "From Web Link", handler: () => { void photoFromLink(); } },
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

/**
 * Reads the copied picture straight from the clipboard where the browser allows it (HTTPS). Otherwise, or if
 * that finds nothing, shows a box to long-press and Paste into, which works on any page.
 */
async function pastePhoto(): Promise<void> {
  if (canReadClipboard()) {
    try {
      const picture = await readClipboardPicture();
      if (picture) {
        await usePicture(picture);
        return;
      }
      const link = await readClipboardLink();
      if (link) {
        await importPicture(link);
        return;
      }
    } catch {
      // Permission refused or unsupported type: fall back to pasting into the box.
    }
  }
  openPasteBox();
}

function openPasteBox(): void {
  pasteBoxOpen.value = true;
  void nextTick(() => pasteBox.value?.focus());
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  const picture = pictureFromPaste(event);
  const link = picture ? null : linkFromPaste(event);
  if (picture) {
    pasteBoxOpen.value = false;
    await usePicture(picture);
  } else if (link) {
    pasteBoxOpen.value = false;
    await importPicture(link);
  } else {
    await showError("What was pasted isn't a picture or a web link. On the store's website, touch and hold the product photo and tap Copy, then paste here again.", "Not a Picture");
  }
}

/** Asks for a product page's link (Share → Copy on the store's page) or a picture's address. */
async function photoFromLink(): Promise<void> {
  const link = await promptForText({
    header: "Photo from Web Link",
    message: "Paste the link to the product's page, or to the picture itself.",
    placeholder: "https://",
    confirmText: "Add",
    inputType: "url",
  });
  if (!link) return;
  const address = webAddressIn(link) ?? link;
  await importPicture(address);
}

/**
 * Pasting a product link (or a copied picture) into the name field adds the photo and, if no name was typed yet,
 * names the item after the product and sets its brand. Ordinary text pastes as usual.
 */
function onNamePaste(event: ClipboardEvent): void {
  const picture = pictureFromPaste(event);
  const link = picture ? null : pastedLinkOnly(event);
  if (!picture && !link) return;
  event.preventDefault();
  if (picture) void usePicture(picture);
  else if (link) void importPicture(link, true);
}

/**
 * The server downloads the picture (or the page's product picture) and stores it like an upload. From the name
 * field, the product's name fills an empty name and its brand an empty brand.
 */
async function importPicture(link: string, fromNameField = false): Promise<void> {
  const nameFromPage = fromNameField && name.value.trim() === "";
  photoBusy.value = true;
  namePending.value = nameFromPage;
  try {
    const imported = await hlist.importPhoto(link);
    setPreview(null);
    photoId.value = imported.photoId;
    if (nameFromPage && imported.title && name.value.trim() === "") {
      name.value = imported.title;
      suggestionPicked.value = false;
    }
    // The page's brand, matched to an existing one (or added), unless a brand was already chosen.
    if (fromNameField && imported.brand && brandId.value === null) {
      brandId.value = await resolveCatalog("brand", imported.brand);
    }
  } catch (error) {
    await showError(error, "Couldn't Add Photo");
  } finally {
    photoBusy.value = false;
    namePending.value = false;
  }
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

function removePhoto(): void {
  photoId.value = null;
  setPreview(null);
}

/** Puts the chosen photo on the saved item, or removes it, if it changed. */
async function applyPhoto(itemId: number, currentPhotoId: number | null): Promise<void> {
  if (photoId.value === currentPhotoId) return;
  if (photoId.value !== null) await hlist.setItemPhoto(itemId, photoId.value);
  else await hlist.removeItemPhoto(itemId);
}

onUnmounted(() => setPreview(null));
const busy = ref(false);
const suggestionPicked = ref(false);
/** Whether the user is still working on the name; suggestions show only then. */
const nameActive = ref(false);
let leaveNameTimer: ReturnType<typeof setTimeout> | undefined;

const canSave = computed(() => name.value.trim() !== "");
const departmentChoice = computed(() => (departmentId.value === null ? "none" : String(departmentId.value)));
const brandChoice = computed(() => (brandId.value === null ? "none" : String(brandId.value)));

const byLabel = (entries: Map<number, string>) =>
  [...entries].sort(([, first], [, second]) => first.localeCompare(second, undefined, { sensitivity: "base" }));
const sortedDepartments = computed(() => byLabel(props.departments));
const sortedBrands = computed(() => byLabel(props.brands));

const suggestions = computed(() => {
  if (props.item || !nameActive.value || suggestionPicked.value || patternPreview.value) return [];
  const query = normalizeItemName(name.value);
  return suggestItems(props.previousItems, name.value, 5)
    .filter((suggestion) => normalizeItemName(suggestion.itemName) !== query || suggestion.departmentId !== departmentId.value);
});

function catalog(type: CatalogType): Map<number, string> {
  return type === "brand" ? props.brands : props.departments;
}

function describe(department: number | null, brand: number | null): string {
  const parts = [
    department !== null ? props.departments.get(department) : undefined,
    brand !== null ? props.brands.get(brand) : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No department or brand";
}

function enterName(typed = false): void {
  clearTimeout(leaveNameTimer);
  nameActive.value = true;
  if (typed) suggestionPicked.value = false;
}

// Hiding the suggestions moves everything below them up, so it must wait until the tap that caused it has
// landed: otherwise a tap on the quantity stepper would hit whatever moved under the finger, and a tap on a
// suggestion (the name field loses focus first) would find the suggestion gone.
function scheduleLeaveName(delayMs = 300): void {
  clearTimeout(leaveNameTimer);
  leaveNameTimer = setTimeout(leaveName, delayMs);
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".name-item, .suggestions-list") || !nameActive.value) return;
  // Leave right after this tap's click, or shortly anyway if the touch turns into a scroll.
  window.addEventListener("click", () => scheduleLeaveName(0), { once: true });
  scheduleLeaveName(600);
}

/** Done with the name: hide suggestions and fill department and brand from earlier items with this name. */
function leaveName(): void {
  clearTimeout(leaveNameTimer);
  if (!nameActive.value) return;
  nameActive.value = false;
  fillFromHistory();
}

/**
 * When the name matches an item added before, sets department and brand from the most recent one, but only
 * where they are still None, so nothing picked by hand is overwritten. The "by … in …" shortcut sets these
 * itself, so it is left alone.
 */
function fillFromHistory(): void {
  if (props.item || patternPreview.value) return;
  const wanted = normalizeItemName(name.value);
  if (!wanted) return;
  const latest = props.previousItems
    .filter((previous) => normalizeItemName(previous.itemName) === wanted)
    .reduce<Item | null>((newest, previous) => (!newest || previous.itemId > newest.itemId ? previous : newest), null);
  if (!latest) return;
  if (departmentId.value === null && latest.departmentId !== null && props.departments.has(latest.departmentId)) {
    departmentId.value = latest.departmentId;
  }
  if (brandId.value === null && latest.brandId !== null && props.brands.has(latest.brandId)) {
    brandId.value = latest.brandId;
  }
  if (photoId.value === null && latest.photoId) {
    photoId.value = latest.photoId;
  }
}

function useSuggestion(suggestion: Item): void {
  clearTimeout(leaveNameTimer);
  nameActive.value = false;
  name.value = suggestion.itemName;
  quantity.value = suggestion.quantity ?? 1;
  departmentId.value = suggestion.departmentId;
  brandId.value = suggestion.brandId;
  comment.value = suggestion.itemComment ?? "";
  photoId.value = suggestion.photoId ?? null;
  setPreview(null);
  suggestionPicked.value = true;
}

/**
 * Reloads brands or departments from the server. They are shared by all users, so entries may have
 * been added (e.g. from another device) since the list screen loaded them.
 */
async function refreshCatalog(type: CatalogType): Promise<void> {
  const entries = type === "brand"
    ? (await hlist.getBrands()).map((brand) => [brand.brandId, brand.brandName] as const)
    : (await hlist.getDepartments()).map((department) => [department.departmentId, department.departmentName] as const);
  for (const [id, label] of entries) catalog(type).set(id, label);
}

/** Finds a department or brand by sounds-alike name, creating it when there is no match. */
async function resolveCatalog(type: CatalogType, label: string): Promise<number> {
  let existing = findCatalogMatch(catalog(type), label);
  if (existing !== null) return existing;
  await refreshCatalog(type);
  existing = findCatalogMatch(catalog(type), label);
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

interface PreviewEntry {
  label: string;
  isNew: boolean;
}

function previewEntry(type: CatalogType, label: string): PreviewEntry {
  const existing = findCatalogMatch(catalog(type), label);
  return existing !== null
    ? { label: catalog(type).get(existing)!, isNew: false }
    : { label: capitalizeWords(label), isNew: true };
}

/**
 * What the item-name shortcut ("<item> by <brand> in <department>", "<item> by <brand>" or
 * "<item> in <department>") will resolve to, shown live while typing.
 */
const patternPreview = computed(() => {
  const parsed = parseItemPattern(name.value);
  if (!parsed) return null;
  return {
    itemName: parsed.itemName,
    brand: parsed.brandName === null ? null : previewEntry("brand", parsed.brandName),
    department: parsed.departmentName === null ? null : previewEntry("department", parsed.departmentName),
  };
});

/** Asks whether a single-part shortcut really names a new brand or department (not "pigs in a blanket"). */
async function confirmNewCatalogEntry(type: CatalogType, itemName: string, label: string): Promise<boolean> {
  const title = type === "brand" ? "Brand" : "Department";
  const entry = capitalizeWords(label);
  const alert = await alertController.create({
    header: `Is “${entry}” a ${title}?`,
    message: type === "brand"
      ? `Create the brand “${entry}” for “${itemName}”, or keep “${name.value.trim()}” as the item name.`
      : `Create the department “${entry}” and add “${itemName}” to it, or keep “${name.value.trim()}” as the item name.`,
    buttons: [
      { text: "Keep as Item Name", role: "cancel" },
      { text: `Create ${title}`, role: "confirm" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === "confirm";
}

/**
 * Splits the name field into item, brand and department. Runs only when saving, so cancelling the sheet
 * leaves the catalog untouched. The full "<item> by <brand> in <department>" form creates whatever doesn't
 * exist yet; the single-part forms ("<item> by <brand>", "<item> in <department>") only create a new entry
 * after the user confirms it, since "by" and "in" are often part of a name. A brand or department picked by
 * hand is kept when the shortcut doesn't mention it.
 */
async function applyPattern(): Promise<void> {
  const parsed = parseItemPattern(name.value);
  if (!parsed) return;
  const askBeforeCreating = parsed.brandName === null || parsed.departmentName === null;
  const resolved: Partial<Record<CatalogType, number>> = {};
  for (const [type, label] of [["brand", parsed.brandName], ["department", parsed.departmentName]] as const) {
    if (label === null) continue;
    if (askBeforeCreating) {
      let existing = findCatalogMatch(catalog(type), label);
      if (existing === null) {
        await refreshCatalog(type);
        existing = findCatalogMatch(catalog(type), label);
      }
      if (existing === null && !(await confirmNewCatalogEntry(type, parsed.itemName, label))) return;
    }
    resolved[type] = await resolveCatalog(type, label);
  }
  name.value = parsed.itemName;
  if (resolved.brand !== undefined) brandId.value = resolved.brand;
  if (resolved.department !== undefined) departmentId.value = resolved.department;
}

async function chooseCatalog(type: CatalogType, event: CustomEvent<{ value: string }>): Promise<void> {
  const target = type === "brand" ? brandId : departmentId;
  const choice = event.detail.value;
  if (choice === "none") {
    target.value = null;
  } else if (choice === "new") {
    // Show the previous choice again while the prompt is open (and if it is cancelled).
    (event.target as HTMLIonSelectElement).value = target.value === null ? "none" : String(target.value);
    const label = await promptForText({
      header: type === "brand" ? "New Brand" : "New Department",
      placeholder: type === "brand" ? "e.g. Horizon" : "e.g. Dairy",
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

function requestBody(): ItemRequest {
  return {
    name: name.value.trim(),
    quantity: quantity.value,
    departmentId: departmentId.value,
    brandId: brandId.value,
    comment: comment.value.trim() || null,
  };
}

/** Offers to raise the quantity of an item already on the list; resolves true when handled. */
async function handleDuplicate(): Promise<boolean> {
  const wanted = normalizeItemName(name.value);
  const duplicate = props.listItems.find((candidate) => normalizeItemName(candidate.itemName) === wanted);
  if (!duplicate) return false;
  const current = duplicate.quantity ?? 1;
  const total = current + quantity.value;
  const alert = await alertController.create({
    header: "Already on This List",
    message: `“${duplicate.itemName}” is already on this list (quantity ${current}). Update the quantity to ${total}?`,
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: "Update", role: "confirm" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== "confirm") return true;
  await hlist.updateItem(props.listId, duplicate.itemId, {
    name: duplicate.itemName,
    quantity: total,
    departmentId: duplicate.departmentId,
    brandId: duplicate.brandId,
    comment: duplicate.itemComment,
  });
  if (photoId.value !== null) await applyPhoto(duplicate.itemId, duplicate.photoId ?? null);
  emit("saved");
  return true;
}

async function save(): Promise<void> {
  if (!canSave.value || busy.value) return;
  leaveName();
  busy.value = true;
  try {
    await applyPattern();
    if (props.item) {
      await hlist.updateItem(props.listId, props.item.itemId, requestBody());
      await applyPhoto(props.item.itemId, initialPhotoId);
      emit("saved");
    } else if (!(await handleDuplicate())) {
      const created = await hlist.addItem(props.listId, requestBody());
      await applyPhoto(created.itemId, null);
      emit("saved");
    }
  } catch (error) {
    await showError(error, "Couldn't Save Item");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  // Keeps the "New" markers in the live preview accurate; failures just leave the loaded catalog.
  void Promise.all([refreshCatalog("brand"), refreshCatalog("department")]).catch(() => {});
  // Wait for the sheet animation; iOS may still decline to show the keyboard without a tap.
  if (!props.item) setTimeout(() => void nameInput.value?.$el.setFocus(), 450);
});
</script>

<style scoped>
.photo-thumb {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 8px 14px 8px 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  background: rgba(118, 118, 128, 0.12);
}

.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.paste-box {
  flex: 1;
  min-height: 44px;
  margin: 8px 0;
  padding: 11px 12px;
  border: 1.5px dashed var(--ion-color-primary);
  border-radius: 10px;
  color: transparent;
  caret-color: transparent;
  font-size: 15px;
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}

.paste-box:empty::before {
  content: attr(data-placeholder);
  color: var(--hlist-secondary-label);
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

.first-group {
  margin-top: 20px;
}

.pattern-preview ion-icon {
  font-size: 20px;
  margin-inline-end: 14px;
}

.pattern-preview h3 {
  font-size: 15px;
  font-weight: 600;
}

.new-badge {
  margin-inline-start: 4px;
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.12);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.suggestion-icon {
  color: var(--hlist-secondary-label);
  font-size: 20px;
  margin-inline-end: 14px;
}

.stepper {
  display: flex;
  align-items: center;
  overflow: hidden;
  border-radius: 9px;
  background: rgba(118, 118, 128, 0.12);
}

.stepper button {
  display: grid;
  place-items: center;
  width: 46px;
  height: 32px;
  padding: 0;
  border: 0;
  color: var(--ion-text-color);
  background: transparent;
  font-size: 18px;
}

.stepper button:disabled {
  opacity: 0.3;
}

.stepper button:active:not(:disabled) {
  background: rgba(118, 118, 128, 0.2);
}

.stepper-value {
  min-width: 32px;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>

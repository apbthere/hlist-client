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
    <form @submit.prevent="save">
      <ion-list :inset="true" class="first-group">
        <ion-item>
          <ion-input
            ref="nameInput"
            v-model="name"
            aria-label="Item name"
            placeholder="Item"
            autocapitalize="sentences"
            autocomplete="off"
            enterkeyhint="done"
            :maxlength="255"
            :clear-input="true"
          />
        </ion-item>
        <ion-item v-if="patternPreview" class="pattern-preview" lines="none">
          <ion-icon slot="start" :icon="sparkles" color="primary" />
          <ion-label>
            <h3>{{ patternPreview.itemName }}</h3>
            <p>
              <span>Brand: {{ patternPreview.brand.label }}</span><span v-if="patternPreview.brand.isNew" class="new-badge">New</span>
              ·
              <span>Department: {{ patternPreview.department.label }}</span><span v-if="patternPreview.department.isNew" class="new-badge">New</span>
            </p>
          </ion-label>
        </ion-item>
      </ion-list>

      <template v-if="suggestions.length">
        <div class="section-header">Suggestions</div>
        <ion-list :inset="true">
          <ion-item v-for="suggestion in suggestions" :key="suggestion.itemId" button :detail="false" @click="useSuggestion(suggestion)">
            <ion-icon slot="start" :icon="timeOutline" class="suggestion-icon" />
            <ion-label>
              <h3>{{ suggestion.itemName }}</h3>
              <p>{{ describe(suggestion.departmentId, suggestion.brandId) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </template>

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
      <p v-if="!item" class="section-footer">Tip: type “Milk by Horizon in Dairy” to fill in the brand and department.</p>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSelect,
  IonSelectOption, IonTextarea, IonTitle, IonToolbar, alertController,
} from "@ionic/vue";
import { add, remove, sparkles, timeOutline } from "ionicons/icons";
import * as hlist from "../api/hlist";
import type { Item, ItemRequest, ListItem } from "../api/types";
import { promptForText, showError } from "../lib/feedback";
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
const busy = ref(false);
const suggestionPicked = ref(false);

const canSave = computed(() => name.value.trim() !== "");
const departmentChoice = computed(() => (departmentId.value === null ? "none" : String(departmentId.value)));
const brandChoice = computed(() => (brandId.value === null ? "none" : String(brandId.value)));

const byLabel = (entries: Map<number, string>) =>
  [...entries].sort(([, first], [, second]) => first.localeCompare(second, undefined, { sensitivity: "base" }));
const sortedDepartments = computed(() => byLabel(props.departments));
const sortedBrands = computed(() => byLabel(props.brands));

const suggestions = computed(() => {
  if (props.item || suggestionPicked.value || parseItemPattern(name.value)) return [];
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

function useSuggestion(suggestion: Item): void {
  name.value = suggestion.itemName;
  quantity.value = suggestion.quantity ?? 1;
  departmentId.value = suggestion.departmentId;
  brandId.value = suggestion.brandId;
  comment.value = suggestion.itemComment ?? "";
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

/** What "<item> by <brand> in <department>" will resolve to, shown live while typing. */
const patternPreview = computed(() => {
  const parsed = parseItemPattern(name.value);
  if (!parsed) return null;
  return {
    itemName: parsed.itemName,
    brand: previewEntry("brand", parsed.brandName),
    department: previewEntry("department", parsed.departmentName),
  };
});

/**
 * Splits the name field into item, brand and department, creating any brand or department that
 * doesn't exist yet. Runs only when saving, so cancelling the sheet leaves the catalog untouched.
 */
async function applyPattern(): Promise<void> {
  const parsed = parseItemPattern(name.value);
  if (!parsed) return;
  const brand = await resolveCatalog("brand", parsed.brandName);
  const department = await resolveCatalog("department", parsed.departmentName);
  name.value = parsed.itemName;
  brandId.value = brand;
  departmentId.value = department;
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
  emit("saved");
  return true;
}

async function save(): Promise<void> {
  if (!canSave.value || busy.value) return;
  busy.value = true;
  try {
    await applyPattern();
    if (props.item) {
      await hlist.updateItem(props.listId, props.item.itemId, requestBody());
      emit("saved");
    } else if (!(await handleDuplicate())) {
      await hlist.addItem(props.listId, requestBody());
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

<template>
  <ion-item-sliding ref="sliding">
    <ion-item-options side="start" @ion-swipe="emit('toggle', slidingElement())">
      <ion-item-option :color="checked ? 'warning' : 'primary'" :expandable="true" @click="emit('toggle', slidingElement())">
        <ion-icon slot="top" :icon="checked ? arrowUndo : checkmarkCircle" />
        {{ checked ? "Undo" : "Done" }}
      </ion-item-option>
    </ion-item-options>

    <ion-item button :detail="false" :class="{ checked }" @click="emit('edit')">
      <button
        slot="start"
        type="button"
        class="check"
        :class="{ checked }"
        :aria-label="checked ? `Mark ${item.itemName} as not bought` : `Mark ${item.itemName} as bought`"
        :aria-pressed="checked"
        @click.stop="emit('toggle')"
      >
        <ion-icon :icon="checked ? checkmarkCircle : ellipseOutline" />
      </button>
      <ion-label>
        <h3>
          <span class="name">{{ item.itemName }}</span>
          <span v-if="(item.quantity ?? 1) > 1" class="quantity">× {{ item.quantity }}</span>
        </h3>
        <p v-if="detail">{{ detail }}</p>
      </ion-label>
    </ion-item>

    <ion-item-options side="end" @ion-swipe="emit('remove', slidingElement())">
      <ion-item-option color="danger" :expandable="true" @click="emit('remove', slidingElement())">
        <ion-icon slot="top" :icon="trash" />
        Remove
      </ion-item-option>
    </ion-item-options>
  </ion-item-sliding>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel } from "@ionic/vue";
import { arrowUndo, checkmarkCircle, ellipseOutline, trash } from "ionicons/icons";
import type { ListItem } from "../api/types";

defineProps<{
  item: ListItem;
  checked: boolean;
  /** Secondary line, e.g. brand and notes. */
  detail: string;
}>();

const emit = defineEmits<{
  toggle: [sliding?: HTMLIonItemSlidingElement];
  edit: [];
  remove: [sliding?: HTMLIonItemSlidingElement];
}>();

const sliding = ref<{ $el: HTMLIonItemSlidingElement } | null>(null);

function slidingElement(): HTMLIonItemSlidingElement | undefined {
  return sliding.value?.$el;
}
</script>

<style scoped>
.check {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 4px 0 -10px;
  padding: 0;
  border: 0;
  color: var(--hlist-separator);
  background: transparent;
  font-size: 26px;
  -webkit-tap-highlight-color: transparent;
}

.check.checked {
  color: var(--ion-color-primary);
}

.check ion-icon {
  transition: transform 0.15s ease;
}

.check:active ion-icon {
  transform: scale(0.85);
}

h3 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 17px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quantity {
  flex: none;
  color: var(--hlist-secondary-label);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

ion-item.checked .name {
  color: var(--hlist-secondary-label);
}
</style>

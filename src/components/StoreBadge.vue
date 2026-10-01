<template>
  <!-- The round badge left of a list: the store's icon when the list names a known store, else cart/checkmark. -->
  <div class="list-badge" :class="{ completed, store: showIcon }">
    <img v-if="showIcon" :src="iconUrl ?? undefined" :alt="store?.name" @error="failed = true" />
    <ion-icon v-else :icon="completed ? checkmark : cart" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonIcon } from "@ionic/vue";
import { cart, checkmark } from "ionicons/icons";
import type { StoreRef } from "../api/types";
import { storeIconUrl } from "../lib/stores";

const props = defineProps<{ store?: StoreRef | null; completed?: boolean }>();

/** Set when the server has no icon (404) or it couldn't load; the cart badge shows instead. */
const failed = ref(false);
watch(() => props.store?.key, () => { failed.value = false; });

const iconUrl = computed(() => storeIconUrl(props.store));
const showIcon = computed(() => iconUrl.value !== null && !failed.value);
</script>

<style scoped>
.list-badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-inline-end: 14px;
  overflow: hidden;
  border-radius: 50%;
  color: #ffffff;
  background: var(--ion-color-primary);
  font-size: 17px;
}

.list-badge.completed {
  background: var(--hlist-separator);
}

/* Store icons sit on white, like app icons, in light and dark mode. */
.list-badge.store {
  background: #ffffff;
  box-shadow: 0 0 0 0.5px var(--hlist-separator);
}

.list-badge.store img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.list-badge.store.completed img {
  opacity: 0.5;
}
</style>

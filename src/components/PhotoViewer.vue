<template>
  <!--
    Full-screen photo for finding a product on the shelf. The app disables browser zoom (it behaves like a native
    app), so pinch-to-zoom, panning and double-tap are handled here. Swipe down or tap ✕ to close.
  -->
  <div
    class="viewer"
    :style="{ '--drag': `${dragY}px`, '--fade': backgroundFade }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img
      class="photo"
      :src="src"
      :alt="title ?? 'Item photo'"
      draggable="false"
      :style="{ transform: `translate(${panX}px, ${panY + dragY}px) scale(${scale})` }"
      :class="{ settling }"
    />
    <button type="button" class="close" aria-label="Close photo" @click="emit('close')">
      <ion-icon :icon="close" />
    </button>
    <p v-if="title" class="caption">{{ title }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { IonIcon } from "@ionic/vue";
import { close } from "ionicons/icons";

defineProps<{ src: string; title?: string }>();
const emit = defineEmits<{ close: [] }>();

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 120;

const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const dragY = ref(0);
const settling = ref(false);
const backgroundFade = computed(() => Math.max(0.3, 1 - Math.abs(dragY.value) / 400));

const pointers = new Map<number, { x: number; y: number }>();
let pinchStart: { distance: number; scale: number } | null = null;
let panStart: { x: number; y: number; panX: number; panY: number } | null = null;
let lastTap = 0;

function distance(): number {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onPointerDown(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest(".close")) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  settling.value = false;
  if (pointers.size === 2) {
    pinchStart = { distance: distance(), scale: scale.value };
    panStart = null;
  } else if (pointers.size === 1) {
    panStart = { x: event.clientX, y: event.clientY, panX: panX.value, panY: panY.value };
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2 && pinchStart) {
    scale.value = Math.min(MAX_SCALE, Math.max(1, pinchStart.scale * (distance() / pinchStart.distance)));
  } else if (pointers.size === 1 && panStart) {
    const dx = event.clientX - panStart.x;
    const dy = event.clientY - panStart.y;
    if (scale.value > 1) {
      panX.value = panStart.panX + dx;
      panY.value = panStart.panY + dy;
    } else {
      dragY.value = dy; // not zoomed: dragging moves the photo, and far enough down closes it
    }
  }
}

function onPointerUp(event: PointerEvent): void {
  const wasTap = panStart !== null && pointers.size === 1
    && Math.hypot(event.clientX - panStart.x, event.clientY - panStart.y) < 10;
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size > 0) return;
  panStart = null;
  settling.value = true;
  if (Math.abs(dragY.value) > DISMISS_DISTANCE) {
    emit("close");
    return;
  }
  dragY.value = 0;
  if (scale.value <= 1.02) {
    scale.value = 1;
    panX.value = 0;
    panY.value = 0;
  }
  if (wasTap) {
    const now = Date.now();
    if (now - lastTap < 300) {
      const zoomIn = scale.value === 1;
      scale.value = zoomIn ? DOUBLE_TAP_SCALE : 1;
      panX.value = 0;
      panY.value = 0;
      lastTap = 0;
    } else {
      lastTap = now;
    }
  }
}

// Keep the screen on while the photo is shown, so it doesn't lock while searching the aisle.
let wakeLock: { release(): Promise<void> } | null = null;

async function keepAwake(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  if (!nav.wakeLock || document.visibilityState !== "visible") return;
  try {
    wakeLock = await nav.wakeLock.request("screen");
  } catch {
    wakeLock = null; // e.g. low-power mode; the photo still shows
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") void keepAwake();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}

onMounted(() => {
  void keepAwake();
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("keydown", onKeyDown);
  void wakeLock?.release().catch(() => {});
});
</script>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(0, 0, 0, var(--fade));
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.photo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center;
  will-change: transform;
  -webkit-touch-callout: none;
}

.photo.settling {
  transition: transform 0.2s ease-out;
}

.close {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  right: 16px;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #ffffff;
  background: rgba(60, 60, 67, 0.7);
  font-size: 22px;
}

.caption {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
  left: 16px;
  right: 16px;
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  pointer-events: none;
}
</style>

<template>
  <div class="build-info">
    <p>
      App {{ appCommit }}<span v-if="appBuilt"> · built {{ appBuilt }}</span>
      <br />
      <span v-if="server">Server {{ server.serverCommit }} · client {{ server.clientCommit }}</span>
      <span v-else>Server build unknown</span>
    </p>
    <!-- The app is served by the server; a different client commit means this device runs a cached old copy. -->
    <p v-if="outdated" class="outdated">
      This app is out of date.
      <button type="button" @click="reload">Reload</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import * as hlist from "../api/hlist";
import type { ServerBuild } from "../api/hlist";
import { formatDate } from "../lib/format";

const appCommit = import.meta.env.VITE_BUILD_COMMIT || "dev";
const appBuiltAt = import.meta.env.VITE_BUILD_TIME || "";
const appBuilt = appBuiltAt
  ? `${formatDate(appBuiltAt)} ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(appBuiltAt))}`
  : "";

const server = ref<ServerBuild | null>(null);
const outdated = computed(() => server.value !== null && appCommit !== "dev"
  && server.value.clientCommit !== "dev" && server.value.clientCommit !== appCommit);

function reload(): void {
  window.location.reload();
}

onMounted(async () => {
  server.value = await hlist.serverBuild().catch(() => null);
});
</script>

<style scoped>
.build-info {
  margin: 28px 20px 12px;
  color: var(--hlist-secondary-label);
  font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
  user-select: text;
}

.build-info p {
  margin: 0;
  line-height: 1.6;
}

.outdated {
  margin-top: 8px !important;
  color: var(--ion-color-warning);
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
}

.outdated button {
  margin-left: 6px;
  padding: 0;
  border: 0;
  color: var(--ion-color-primary);
  background: none;
  font: inherit;
  font-weight: 600;
}
</style>

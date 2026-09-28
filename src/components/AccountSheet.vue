<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>Account</ion-title>
      <ion-buttons slot="end">
        <ion-button :strong="true" @click="emit('close')">Done</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list :inset="true" class="profile">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="personCircle" class="avatar" />
        <ion-label>
          <h2>{{ currentUser?.username }}</h2>
          <p>Signed in to HList</p>
        </ion-label>
      </ion-item>
    </ion-list>

    <div class="section-header">Change Password</div>
    <form @submit.prevent="changePassword">
      <!-- Hidden username field so Keychain updates the right saved password. -->
      <input class="hidden-username" type="text" autocomplete="username" :value="currentUser?.username" readonly tabindex="-1" aria-hidden="true" />
      <ion-list :inset="true">
        <ion-item>
          <ion-input v-model="currentPassword" type="password" aria-label="Current password" placeholder="Current Password" autocomplete="current-password" required />
        </ion-item>
        <ion-item>
          <ion-input v-model="newPassword" type="password" aria-label="New password" placeholder="New Password" autocomplete="new-password" required />
        </ion-item>
        <ion-item button :detail="false" :disabled="!canChange || busy" @click="changePassword">
          <ion-label color="primary">{{ busy ? "Changing…" : "Change Password" }}</ion-label>
        </ion-item>
      </ion-list>
      <p class="section-footer">Other devices will be signed out.</p>
    </form>

    <ion-list :inset="true" class="sign-out">
      <ion-item button :detail="false" @click="confirmSignOut">
        <ion-label color="danger" class="ion-text-center">Sign Out</ion-label>
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonTitle,
  IonToolbar, actionSheetController, alertController,
} from "@ionic/vue";
import { personCircle } from "ionicons/icons";
import * as hlist from "../api/hlist";
import { showError } from "../lib/feedback";
import { currentUser, signOut } from "../session";

const emit = defineEmits<{ close: []; signedOut: [] }>();

const currentPassword = ref("");
const newPassword = ref("");
const busy = ref(false);
const canChange = computed(() => currentPassword.value !== "" && newPassword.value !== "");

async function changePassword(): Promise<void> {
  if (!canChange.value || busy.value) return;
  busy.value = true;
  try {
    await hlist.changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = "";
    newPassword.value = "";
    const alert = await alertController.create({
      header: "Password Changed",
      message: "You've been signed out on your other devices.",
      buttons: ["OK"],
    });
    await alert.present();
  } catch (error) {
    await showError(error, "Couldn't Change Password");
  } finally {
    busy.value = false;
  }
}

async function confirmSignOut(): Promise<void> {
  const sheet = await actionSheetController.create({
    header: "You'll need your password to sign back in on this device.",
    buttons: [
      { text: "Sign Out", role: "destructive" },
      { text: "Cancel", role: "cancel" },
    ],
  });
  await sheet.present();
  const { role } = await sheet.onDidDismiss();
  if (role !== "destructive") return;
  await signOut();
  emit("signedOut");
}
</script>

<style scoped>
.profile {
  margin-top: 24px;
}

.avatar {
  font-size: 56px;
  color: var(--hlist-separator);
  margin-inline-end: 14px;
}

.profile h2 {
  font-size: 20px;
  font-weight: 600;
}

.sign-out {
  margin-top: 32px;
}

.hidden-username {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>

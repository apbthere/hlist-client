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
      <input class="hidden-username" type="text" name="username" autocomplete="username" :value="currentUser?.username" readonly tabindex="-1" aria-hidden="true" />
      <ion-list :inset="true">
        <ion-item>
          <text-field id="current-password" ref="currentField" v-model="currentPassword" name="current-password" type="password" placeholder="Current Password" autocomplete="current-password" required />
        </ion-item>
        <ion-item>
          <text-field id="new-password" ref="newField" v-model="newPassword" name="new-password" type="password" placeholder="New Password" autocomplete="new-password" enterkeyhint="done" required />
        </ion-item>
        <ion-item button :detail="false" :disabled="busy" @click="changePassword">
          <ion-label color="primary">{{ busy ? "Changing…" : "Change Password" }}</ion-label>
        </ion-item>
      </ion-list>
      <p class="section-footer">Other devices will be signed out.</p>
    </form>

    <ion-list :inset="true" class="desktop-link">
      <ion-item button :detail="true" href="/?ui=desktop">
        <ion-icon slot="start" :icon="desktopOutline" color="primary" />
        <ion-label>Use Desktop Version</ion-label>
      </ion-item>
    </ion-list>

    <ion-list :inset="true" class="sign-out">
      <ion-item button :detail="false" @click="confirmSignOut">
        <ion-label color="danger" class="ion-text-center">Sign Out</ion-label>
      </ion-item>
    </ion-list>

    <build-info />
  </ion-content>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar,
  actionSheetController, alertController,
} from "@ionic/vue";
import { desktopOutline, personCircle } from "ionicons/icons";
import * as hlist from "../api/hlist";
import BuildInfo from "./BuildInfo.vue";
import TextField from "./TextField.vue";
import { showError } from "../lib/feedback";
import { currentUser, signOut } from "../session";

const emit = defineEmits<{ close: []; signedOut: [] }>();

const currentPassword = ref("");
const newPassword = ref("");
const busy = ref(false);
const currentField = ref<InstanceType<typeof TextField> | null>(null);
const newField = ref<InstanceType<typeof TextField> | null>(null);

async function changePassword(): Promise<void> {
  if (busy.value) return;
  // Read the fields directly: AutoFill may have filled them without input events.
  currentPassword.value = currentField.value?.currentValue() ?? currentPassword.value;
  newPassword.value = newField.value?.currentValue() ?? newPassword.value;
  if (!currentPassword.value || !newPassword.value) {
    await showError("Enter your current password and a new password.", "Couldn't Change Password");
    return;
  }
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

.desktop-link {
  margin-top: 32px;
}

.sign-out {
  margin-top: 16px;
}

.hidden-username {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>

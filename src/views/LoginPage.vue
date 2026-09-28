<template>
  <ion-page>
    <ion-content :fullscreen="true" class="ion-padding-vertical">
      <div class="login">
        <img class="app-icon" :src="iconUrl" alt="" />
        <h1>HList</h1>
        <p class="tagline">Shopping lists that keep up with you.</p>

        <ion-segment v-model="mode" class="mode-switch">
          <ion-segment-button value="signIn"><ion-label>Sign In</ion-label></ion-segment-button>
          <ion-segment-button value="register"><ion-label>Create Account</ion-label></ion-segment-button>
        </ion-segment>

        <!-- A real <form> lets Safari offer Keychain autofill and "Save Password". -->
        <form @submit.prevent="submit">
          <ion-list :inset="true">
            <ion-item>
              <text-field
                id="username"
                ref="usernameField"
                v-model="username"
                name="username"
                placeholder="Username"
                autocomplete="username"
                :maxlength="50"
                required
              />
            </ion-item>
            <ion-item>
              <text-field
                id="password"
                ref="passwordField"
                v-model="password"
                name="password"
                type="password"
                placeholder="Password"
                :autocomplete="mode === 'signIn' ? 'current-password' : 'new-password'"
                :enterkeyhint="mode === 'register' && inviteRequired ? 'next' : 'go'"
                required
              />
            </ion-item>
            <ion-item v-if="mode === 'register' && inviteRequired">
              <text-field
                id="invite-code"
                ref="inviteField"
                v-model="inviteCode"
                name="invite-code"
                placeholder="Invite Code"
                autocomplete="off"
                enterkeyhint="go"
                :maxlength="200"
                required
              />
            </ion-item>
          </ion-list>

          <ion-list v-if="mode === 'signIn'" :inset="true" class="options">
            <ion-item>
              <ion-toggle v-model="rememberMe">Keep Me Signed In</ion-toggle>
            </ion-item>
          </ion-list>
          <p class="section-footer">
            {{ mode === "signIn"
              ? "Stay signed in on this device for 30 days, even after closing the app."
              : inviteRequired
                ? "Ask the person who runs this HList server for an invite code. You'll stay signed in on this device for 30 days."
                : "You'll stay signed in on this device for 30 days." }}
          </p>

          <div class="actions">
            <ion-button type="submit" expand="block" class="primary-action" :disabled="busy">
              <ion-spinner v-if="busy" name="crescent" />
              <span v-else>{{ mode === "signIn" ? "Sign In" : "Create Account" }}</span>
            </ion-button>
          </div>
        </form>
        <p class="desktop-switch"><a href="/?ui=desktop">Use Desktop Version</a></p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  IonButton, IonContent, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, IonSpinner,
  IonToggle, useIonRouter,
} from "@ionic/vue";
import * as hlist from "../api/hlist";
import TextField from "../components/TextField.vue";
import { showError } from "../lib/feedback";
import { signIn } from "../session";

const iconUrl = `${import.meta.env.BASE_URL}apple-touch-icon-180x180.png`;
const router = useIonRouter();

const mode = ref<"signIn" | "register">("signIn");
const username = ref("");
const password = ref("");
const rememberMe = ref(true);
const inviteCode = ref("");
const inviteRequired = ref(false);
const busy = ref(false);

type Field = InstanceType<typeof TextField> | null;
const usernameField = ref<Field>(null);
const passwordField = ref<Field>(null);
const inviteField = ref<Field>(null);

onMounted(async () => {
  inviteRequired.value = await hlist.inviteRequired().catch(() => false);
});

/** Reads what's in the fields now, which may differ from the model after an AutoFill without input events. */
function missingField(): string | null {
  username.value = usernameField.value?.currentValue() ?? username.value;
  password.value = passwordField.value?.currentValue() ?? password.value;
  if (inviteField.value) inviteCode.value = inviteField.value.currentValue();
  if (!username.value.trim()) return "Enter your username.";
  if (!password.value) return "Enter your password.";
  if (mode.value === "register" && inviteRequired.value && !inviteCode.value.trim()) return "Enter your invite code.";
  return null;
}

async function submit() {
  if (busy.value) return;
  const missing = missingField();
  if (missing) {
    await showError(missing, mode.value === "signIn" ? "Couldn't Sign In" : "Couldn't Create Account");
    return;
  }
  busy.value = true;
  const name = username.value.trim();
  try {
    if (mode.value === "register") {
      await hlist.register(name, password.value, inviteRequired.value ? inviteCode.value.trim() : undefined);
      await signIn(name, password.value, true);
    } else {
      await signIn(name, password.value, rememberMe.value);
    }
    password.value = "";
    router.navigate("/lists", "root", "replace");
  } catch (error) {
    await showError(error, mode.value === "signIn" ? "Couldn't Sign In" : "Couldn't Create Account");
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.login {
  max-width: 480px;
  margin: 0 auto;
  padding-top: max(40px, 8vh);
}

.app-icon {
  display: block;
  width: 88px;
  height: 88px;
  margin: 0 auto 16px;
  border-radius: 20px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}

h1 {
  margin: 0;
  font-size: 34px;
  font-weight: 700;
  text-align: center;
}

.tagline {
  margin: 6px 0 28px;
  color: var(--hlist-secondary-label);
  font-size: 17px;
  text-align: center;
}

.mode-switch {
  width: auto;
  margin: 0 16px 8px;
}

.options {
  margin-top: 0;
  margin-bottom: 0;
}

.actions {
  margin: 28px 16px 0;
}

.desktop-switch {
  margin: 28px 0 0;
  font-size: 15px;
  text-align: center;
}

.desktop-switch a {
  color: var(--ion-color-primary);
  text-decoration: none;
}

.primary-action {
  --border-radius: 12px;
  height: 50px;
  font-size: 17px;
  font-weight: 600;
}
</style>

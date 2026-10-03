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
                :autocomplete="mode === 'signIn' && passkeys ? 'username webauthn' : 'username'"
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
            <ion-button
              v-if="mode === 'signIn' && passkeys"
              fill="clear"
              expand="block"
              class="passkey-action"
              :disabled="busy"
              @click="signInWithPasskey()"
            >
              <ion-icon slot="start" :icon="keyOutline" />
              Sign In with Passkey
            </ion-button>
          </div>
        </form>
        <p class="desktop-switch"><a href="/?ui=desktop">Use Desktop Version</a></p>
        <build-info />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, IonSpinner,
  IonToggle, alertController, onIonViewWillLeave, useIonRouter,
} from "@ionic/vue";
import { keyOutline } from "ionicons/icons";
import * as hlist from "../api/hlist";
import BuildInfo from "../components/BuildInfo.vue";
import TextField from "../components/TextField.vue";
import { showError } from "../lib/feedback";
import {
  addPasskey, autofillAvailable, cancelPasskeyRequest, getPasskeys, passkeysAvailable, wasCancelled,
} from "../lib/passkeys";
import { passkeySignIn, signIn } from "../session";
import { pathAfterSignIn } from "../router";

const iconUrl = `${import.meta.env.BASE_URL}apple-touch-icon-180x180.png`;
const router = useIonRouter();

const mode = ref<"signIn" | "register">("signIn");
const username = ref("");
const password = ref("");
const rememberMe = ref(true);
const inviteCode = ref("");
const inviteRequired = ref(false);
const busy = ref(false);
/** Whether this address can use passkeys (see lib/passkeys.ts). */
const passkeys = ref(false);

type Field = InstanceType<typeof TextField> | null;
const usernameField = ref<Field>(null);
const passwordField = ref<Field>(null);
const inviteField = ref<Field>(null);

onMounted(async () => {
  void startAutofill();
  inviteRequired.value = await hlist.inviteRequired().catch(() => false);
});

onIonViewWillLeave(cancelPasskeyRequest);
onBeforeUnmount(cancelPasskeyRequest);

watch(mode, (value) => {
  if (value === "signIn") void startAutofill();
  else cancelPasskeyRequest();
});

/**
 * Offers saved passkeys in the username field's AutoFill: tapping the field shows them above the keyboard,
 * and picking one signs in after Face ID or Touch ID. The request waits in the background until then.
 */
async function startAutofill(): Promise<void> {
  passkeys.value = await passkeysAvailable();
  if (!await autofillAvailable() || mode.value !== "signIn") return;
  await nextTick(); // The field must say "webauthn" before the request starts.
  try {
    await passkeySignIn(() => rememberMe.value, true);
    router.navigate(pathAfterSignIn(), "root", "replace");
  } catch (error) {
    // Cancelled when the page closes, the mode changes or the button starts its own request.
    if (wasCancelled(error)) return;
    await showError(error, "Couldn't Sign In");
    void startAutofill();
  }
}

/** The button, for when AutoFill doesn't show the passkey (or there's no AutoFill). */
async function signInWithPasskey(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  // Stop the AutoFill request first: the browser runs one passkey request at a time.
  cancelPasskeyRequest();
  try {
    await passkeySignIn(rememberMe.value);
    router.navigate(pathAfterSignIn(), "root", "replace");
    return;
  } catch (error) {
    if (!wasCancelled(error)) await showError(error, "Couldn't Sign In");
  } finally {
    busy.value = false;
  }
  void startAutofill();
}

const declinedKey = (name: string) => `hlist.passkeyDeclined.${name.toLowerCase()}`;

/**
 * After a password sign-in, offers once to save a passkey, so next time it's Face ID or Touch ID instead.
 * Not when the account already has one (iCloud Keychain shares it across devices) or the offer was declined.
 */
async function offerPasskey(name: string): Promise<void> {
  if (!passkeys.value) return;
  try {
    if (localStorage.getItem(declinedKey(name))) return;
  } catch {
    // Storage unavailable (private browsing): ask anyway.
  }
  const existing = await getPasskeys().catch(() => null);
  if (!existing || existing.length > 0) return;
  const alert = await alertController.create({
    header: "Sign In with a Passkey?",
    message: "Next time, sign in with Face ID or Touch ID instead of your password.",
    buttons: [
      { text: "Not Now", role: "cancel" },
      { text: "Save Passkey", role: "confirm" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== "confirm") {
    try {
      localStorage.setItem(declinedKey(name), "1");
    } catch {
      // Ignore: it just asks again next time.
    }
    return;
  }
  try {
    await addPasskey();
  } catch (error) {
    if (!wasCancelled(error)) await showError(error, "Couldn't Save Passkey");
  }
}

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
  // Before a passkey can be saved below; AutoFill starts again if this sign-in fails.
  cancelPasskeyRequest();
  const name = username.value.trim();
  try {
    if (mode.value === "register") {
      await hlist.register(name, password.value, inviteRequired.value ? inviteCode.value.trim() : undefined);
      await signIn(name, password.value, true);
    } else {
      await signIn(name, password.value, rememberMe.value);
    }
    password.value = "";
    await offerPasskey(name);
    router.navigate(pathAfterSignIn(), "root", "replace");
  } catch (error) {
    await showError(error, mode.value === "signIn" ? "Couldn't Sign In" : "Couldn't Create Account");
    if (mode.value === "signIn") void startAutofill();
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

.passkey-action {
  margin-top: 8px;
  font-size: 17px;
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

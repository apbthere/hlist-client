<template>
  <!--
    A plain <input> styled like an iOS text field, used for sign-in and password forms instead of
    ion-input. On iPad, Safari's AutoFill fills username and password together without always firing
    input events for the field that isn't focused; ion-input then re-renders its stale empty value
    over the filled text. A native input keeps whatever AutoFill puts in it.
  -->
  <div class="text-field">
    <input
      ref="input"
      :id="id"
      :name="name"
      :type="revealed ? 'text' : type"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="placeholder"
      :autocomplete="autocomplete"
      :autocapitalize="autocapitalize"
      :spellcheck="false"
      :enterkeyhint="enterkeyhint"
      :maxlength="maxlength"
      :required="required"
      autocorrect="off"
      @input="sync"
      @change="sync"
    />
    <button
      v-if="type === 'password'"
      type="button"
      class="reveal"
      :aria-label="revealed ? 'Hide password' : 'Show password'"
      @click="revealed = !revealed"
    >
      <ion-icon :icon="revealed ? eyeOff : eye" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IonIcon } from "@ionic/vue";
import { eye, eyeOff } from "ionicons/icons";

withDefaults(defineProps<{
  modelValue: string;
  id: string;
  name: string;
  placeholder: string;
  autocomplete: string;
  type?: "text" | "password";
  autocapitalize?: string;
  enterkeyhint?: "next" | "go" | "done";
  maxlength?: number;
  required?: boolean;
}>(), {
  type: "text",
  autocapitalize: "off",
  enterkeyhint: "next",
  maxlength: undefined,
  required: false,
});

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const input = ref<HTMLInputElement | null>(null);
const revealed = ref(false);

function sync(): void {
  if (input.value) emit("update:modelValue", input.value.value);
}

/** The field's current text, including anything AutoFill filled in without an input event. */
function currentValue(): string {
  sync();
  return input.value?.value ?? "";
}

defineExpose({ currentValue });
</script>

<style scoped>
.text-field {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
}

input {
  flex: 1;
  min-width: 0;
  padding: 11px 0;
  border: 0;
  outline: none;
  color: var(--ion-text-color);
  background: transparent;
  font: inherit;
  font-size: 17px;
}

input::placeholder {
  color: var(--hlist-secondary-label);
}

.reveal {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-inline-end: -12px;
  padding: 0;
  border: 0;
  color: var(--ion-color-primary);
  background: transparent;
  font-size: 20px;
}
</style>

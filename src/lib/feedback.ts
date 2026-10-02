import { alertController } from "@ionic/vue";

/** Shows an iOS-style alert for a failed action. */
export async function showError(error: unknown, title = "Something Went Wrong"): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const alert = await alertController.create({ header: title, message, buttons: ["OK"] });
  await alert.present();
}

/** Prompts for a single line of text; resolves to the trimmed value, or null when cancelled or empty. */
export async function promptForText(options: {
  header: string;
  message?: string;
  placeholder: string;
  confirmText: string;
  value?: string;
  /** "url" shows the web-address keyboard, without auto-capitalisation. */
  inputType?: "text" | "url";
}): Promise<string | null> {
  const url = options.inputType === "url";
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    inputs: [{
      name: "value",
      type: url ? "url" : "text",
      placeholder: options.placeholder,
      value: options.value ?? "",
      attributes: url
        ? { maxlength: 2000, autocapitalize: "off", autocorrect: "off", spellcheck: false, enterkeyhint: "go" }
        : { maxlength: 255, autocapitalize: "sentences", enterkeyhint: "done" },
    }],
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: options.confirmText, role: "confirm" },
    ],
  });
  await alert.present();
  const { data, role } = await alert.onDidDismiss<{ values: { value: string } }>();
  const value = data?.values?.value?.trim();
  return role === "confirm" && value ? value : null;
}

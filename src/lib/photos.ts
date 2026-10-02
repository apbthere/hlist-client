// Item photos: preparing pictures for upload, reading them from the clipboard, and their addresses.

/** Long edge of photos as uploaded; the server keeps at most 1600 px. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export function photoUrl(photoId: number): string {
  return `/api/photos/${photoId}`;
}

export function thumbnailUrl(photoId: number): string {
  return `/api/photos/${photoId}/thumbnail`;
}

/**
 * Shrinks a picture to at most 1600 px and re-encodes it as JPEG before upload. Drawing it onto a canvas
 * applies the photo's rotation (iPhone photos are often stored sideways with a rotation tag) and turns HEIC
 * into JPEG, so the server gets an upright, small picture.
 */
export async function prepareForUpload(picture: Blob): Promise<Blob> {
  const image = await decode(picture);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This device can't prepare pictures.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the picture."))), "image/jpeg", JPEG_QUALITY));
  } finally {
    image.close();
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

async function decode(picture: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(picture);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall back to an <img>, which decodes more formats in some browsers.
    }
  }
  const url = URL.createObjectURL(picture);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("That file isn't a picture HList can use.");
  }
}

/**
 * Whether the clipboard can be read directly. Browsers only allow it on secure pages (HTTPS or localhost), so
 * it's unavailable when the app is opened by a plain-HTTP address such as http://192.168.0.24; pasting into a
 * field (see pictureFromPaste) works everywhere.
 */
export function canReadClipboard(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true && typeof navigator.clipboard?.read === "function";
}

/**
 * The first picture on the clipboard (e.g. a product photo copied on a store's website), or null.
 * Must be called from a tap: iOS then shows its "Paste" confirmation.
 */
export async function readClipboardPicture(): Promise<Blob | null> {
  if (!navigator.clipboard?.read) {
    throw new Error("This browser can't read pictures from the clipboard.");
  }
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (type) return item.getType(type);
  }
  return null;
}

/** The picture in a paste (long-press → Paste into a field), or null if what was pasted isn't a picture. */
export function pictureFromPaste(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (!data) return null;
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith("image/")) return file;
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/**
 * The web address in a paste when it holds no picture file, or null. Safari on iPad pastes a copied website
 * photo as its address (or as HTML with an <img>), and a shared page as its link; the server downloads either.
 */
export function linkFromPaste(event: ClipboardEvent): string | null {
  const data = event.clipboardData;
  if (!data) return null;
  for (const line of (data.getData("text/uri-list") ?? "").split(/\r?\n/)) {
    if (!line.startsWith("#") && isWebAddress(line.trim())) return line.trim();
  }
  const html = data.getData("text/html");
  if (html) {
    const src = new DOMParser().parseFromString(html, "text/html").querySelector("img[src]")?.getAttribute("src")?.trim();
    if (src && isWebAddress(src)) return src;
  }
  return webAddressIn(data.getData("text/plain"));
}

/**
 * The link in a paste that is only a link (a product page shared with Share → Copy, or a copied web image), or
 * null. Pasting ordinary text that happens to contain an address isn't treated as a link.
 */
export function pastedLinkOnly(event: ClipboardEvent): string | null {
  const plain = event.clipboardData?.getData("text/plain")?.trim() ?? "";
  if (plain && !(isWebAddress(plain) && !/\s/.test(plain))) return null;
  return linkFromPaste(event);
}

/** The first http(s) address in a piece of text, e.g. a link shared as "Product name https://…", or null. */
export function webAddressIn(text: string | null | undefined): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text ?? "");
  return match && isWebAddress(match[0]) ? match[0] : null;
}

function isWebAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** A web address on the clipboard, for browsers that allow reading it (HTTPS), or null. */
export async function readClipboardLink(): Promise<string | null> {
  if (!navigator.clipboard?.readText) return null;
  return webAddressIn(await navigator.clipboard.readText());
}

/**
 * Downloads photos in the background so the app's offline storage has them in the store, where signal is often
 * poor. One at a time, so it never competes with what the user is doing.
 */
export function prefetchPhotos(photoIds: number[]): void {
  const queue = [...new Set(photoIds)].flatMap((id) => [thumbnailUrl(id), photoUrl(id)]);
  const next = (): void => {
    const url = queue.shift();
    if (!url) return;
    fetch(url, { credentials: "same-origin" }).catch(() => {}).finally(() => setTimeout(next, 50));
  };
  setTimeout(next, 500);
}

/** Forgets cached photos, e.g. on sign-out on a shared device. */
export async function clearCachedPhotos(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete("item-photos").catch(() => false);
}

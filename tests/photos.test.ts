import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canReadClipboard, linkFromPaste, pastedLinkOnly, photoUrl, pictureFromPaste, readClipboardPicture, thumbnailUrl,
  webAddressIn,
} from "../src/lib/photos";
import { findPhotos, importPhoto, uploadPhoto } from "../src/api/hlist";

describe("photo addresses", () => {
  it("point at the server's photo and thumbnail", () => {
    expect(photoUrl(42)).toBe("/api/photos/42");
    expect(thumbnailUrl(42)).toBe("/api/photos/42/thumbnail");
  });
});

describe("uploadPhoto", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token; path=/";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the picture itself as the body, with its type and the CSRF token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ photoId: 7, width: 1600, height: 1200 }), { status: 201 }));
    const picture = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

    await expect(uploadPhoto(picture)).resolves.toEqual({ photoId: 7, width: 1600, height: 1200 });

    const [path, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(path).toBe("/api/photos");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(picture);
    expect(headers["Content-Type"]).toBe("image/jpeg");
    expect(headers["X-XSRF-TOKEN"]).toBe("token");
  });
});

describe("readClipboardPicture", () => {
  afterEach(() => vi.unstubAllGlobals());

  function clipboardWith(items: { types: string[]; getType: (type: string) => Promise<Blob> }[]) {
    vi.stubGlobal("navigator", { clipboard: { read: async () => items } });
  }

  it("returns the first picture on the clipboard", async () => {
    const picture = new Blob(["png"], { type: "image/png" });
    clipboardWith([
      { types: ["text/plain"], getType: async () => new Blob(["text"]) },
      { types: ["text/html", "image/png"], getType: async (type) => (type === "image/png" ? picture : new Blob()) },
    ]);
    await expect(readClipboardPicture()).resolves.toBe(picture);
  });

  it("returns null when the clipboard holds no picture", async () => {
    clipboardWith([{ types: ["text/plain"], getType: async () => new Blob(["text"]) }]);
    await expect(readClipboardPicture()).resolves.toBeNull();
  });

  it("fails where the clipboard can't be read, so the editor falls back to the paste box", async () => {
    vi.stubGlobal("navigator", {});
    await expect(readClipboardPicture()).rejects.toThrow(/can't read pictures/);
  });
});

describe("pasting a picture into the paste box", () => {
  function pasteOf(files: File[], items: { kind: string; type: string; getAsFile: () => File | null }[] = []) {
    return { clipboardData: { files, items } } as unknown as ClipboardEvent;
  }

  it("takes the pasted picture", () => {
    const picture = new File(["png"], "photo.png", { type: "image/png" });
    expect(pictureFromPaste(pasteOf([picture]))).toBe(picture);
    expect(pictureFromPaste(pasteOf([], [{ kind: "file", type: "image/jpeg", getAsFile: () => picture }]))).toBe(picture);
  });

  it("ignores pasted text", () => {
    expect(pictureFromPaste(pasteOf([], [{ kind: "string", type: "text/plain", getAsFile: () => null }]))).toBeNull();
    expect(pictureFromPaste({ clipboardData: null } as unknown as ClipboardEvent)).toBeNull();
  });
});

describe("canReadClipboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("needs a secure page (HTTPS or localhost)", () => {
    vi.stubGlobal("navigator", { clipboard: { read: async () => [] } });
    vi.stubGlobal("isSecureContext", false);
    expect(canReadClipboard()).toBe(false);
    vi.stubGlobal("isSecureContext", true);
    expect(canReadClipboard()).toBe(true);
  });
});

describe("pasting a web link into the paste box", () => {
  function pasteOf(data: Record<string, string>) {
    return { clipboardData: { files: [], items: [], getData: (type: string) => data[type] ?? "" } } as unknown as ClipboardEvent;
  }

  const image = "https://gdx-assets.costco.com/adobe/assets/urn:aaid:aem:e655/as/4000349222-847__1.avif?width=350";

  it("takes the address from a URL list, a pasted image or plain text", () => {
    expect(linkFromPaste(pasteOf({ "text/uri-list": `# comment\r\n${image}` }))).toBe(image);
    expect(linkFromPaste(pasteOf({ "text/html": `<meta charset="utf-8"><img src="${image.replace("&", "&amp;")}" alt="Bites">` }))).toBe(image);
    expect(linkFromPaste(pasteOf({ "text/plain": "Jojo's bites https://www.costco.com/p/-/jojos/4000349222?langId=-1" })))
      .toBe("https://www.costco.com/p/-/jojos/4000349222?langId=-1");
  });

  it("ignores text without a web address", () => {
    expect(linkFromPaste(pasteOf({ "text/plain": "milk", "text/html": "<b>milk</b>" }))).toBeNull();
    expect(linkFromPaste(pasteOf({ "text/uri-list": "ftp://example.com/a.jpg" }))).toBeNull();
    expect(linkFromPaste({ clipboardData: null } as unknown as ClipboardEvent)).toBeNull();
    expect(webAddressIn(undefined)).toBeNull();
  });
});

describe("importPhoto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server to download the picture", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ photoId: 9, width: 350, height: 350 }), {
      status: 201, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(importPhoto("https://www.costco.com/p/1")).resolves.toMatchObject({ photoId: 9 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/photos/import");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://www.costco.com/p/1" });
  });
});

describe("pasting into the item name", () => {
  function pasteOf(data: Record<string, string>) {
    return { clipboardData: { files: [], items: [], getData: (type: string) => data[type] ?? "" } } as unknown as ClipboardEvent;
  }

  it("treats a paste that is only a link as a product link", () => {
    const link = "https://www.costco.com/p/-/jojos/4000349222?langId=-1";
    expect(pastedLinkOnly(pasteOf({ "text/plain": `  ${link}\n` }))).toBe(link);
    expect(pastedLinkOnly(pasteOf({ "text/uri-list": link }))).toBe(link);
    expect(pastedLinkOnly(pasteOf({ "text/html": `<img src="${link}">` }))).toBe(link);
  });

  it("pastes ordinary text as text", () => {
    expect(pastedLinkOnly(pasteOf({ "text/plain": "Greek yogurt" }))).toBeNull();
    expect(pastedLinkOnly(pasteOf({ "text/plain": "Bites https://www.costco.com/p/1", "text/uri-list": "https://www.costco.com/p/1" }))).toBeNull();
  });
});

describe("findPhotos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("searches by name and, when given, brand", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await findPhotos("Whole milk", "Publix");
    await findPhotos("Bananas & more", null);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/photos/suggestions?name=Whole+milk&brand=Publix");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/photos/suggestions?name=Bananas+%26+more");
  });
});

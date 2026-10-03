import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Passkeys = typeof import("../src/lib/passkeys");

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

describe("passkeys", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let passkeys: Passkeys;

  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("PublicKeyCredential", class {});
    document.cookie = "XSRF-TOKEN=token; path=/";
    // passkeysAvailable() remembers its answer for the page's lifetime.
    vi.resetModules();
    passkeys = await import("../src/lib/passkeys");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts between base64url and bytes", () => {
    const buffer = bytes(0xfb, 0xff, 0xbf, 0x00, 0x01);
    const text = passkeys.toBase64url(buffer);
    expect(text).toBe("-_-_AAE");
    expect(new Uint8Array(passkeys.fromBase64url(text))).toEqual(new Uint8Array(buffer));
  });

  it("offers passkeys only on addresses the server accepts them from", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { origins: [window.location.origin] }));
    await expect(passkeys.passkeysAvailable()).resolves.toBe(true);

    vi.resetModules();
    const elsewhere: Passkeys = await import("../src/lib/passkeys");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { origins: ["https://hlist.example.com"] }));
    await expect(elsewhere.passkeysAvailable()).resolves.toBe(false);
  });

  it("doesn't offer passkeys without a secure context", async () => {
    vi.stubGlobal("isSecureContext", false);
    await expect(passkeys.passkeysAvailable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names passkeys after the device", () => {
    expect(passkeys.deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", 5)).toBe("iPhone");
    // iPadOS Safari asks for desktop sites and says it's a Mac.
    expect(passkeys.deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe("iPad");
    expect(passkeys.deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)).toBe("Mac");
  });

  it("signs in with the passkey the browser returns", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      challenge: "AQID", rpId: "localhost", userVerification: "required", allowCredentials: [],
    }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const get = vi.fn().mockResolvedValue({
      id: "BAU", rawId: bytes(4, 5), type: "public-key", authenticatorAttachment: "platform",
      response: {
        authenticatorData: bytes(6), clientDataJSON: bytes(7), signature: bytes(8), userHandle: bytes(9),
      },
      getClientExtensionResults: () => ({}),
    });
    vi.stubGlobal("navigator", { credentials: { get } });

    let remember = false;
    const signedIn = passkeys.signInWithPasskey(() => remember, true);
    remember = true; // Toggled while AutoFill waited.
    await signedIn;

    const request = get.mock.calls[0][0] as CredentialRequestOptions;
    expect(request.mediation).toBe("conditional");
    expect(new Uint8Array(request.publicKey!.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(request.publicKey!.userVerification).toBe("required");

    const [path, init] = fetchMock.mock.calls[1];
    expect(path).toBe("/login/webauthn?remember-me=true");
    expect((init?.headers as Record<string, string>)["X-XSRF-TOKEN"]).toBe("token");
    expect(JSON.parse(init?.body as string)).toEqual({
      id: "BAU", rawId: "BAU", type: "public-key", authenticatorAttachment: "platform",
      response: { authenticatorData: "Bg", clientDataJSON: "Bw", signature: "CA", userHandle: "CQ" },
      clientExtensionResults: {},
    });
  });

  it("passes on the server's message when a passkey doesn't sign in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { challenge: "AQID", rpId: "localhost" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "This passkey didn't work." }));
    vi.stubGlobal("navigator", { credentials: { get: vi.fn().mockResolvedValue({
      id: "BAU", rawId: bytes(4, 5), type: "public-key", authenticatorAttachment: "platform",
      response: { authenticatorData: bytes(6), clientDataJSON: bytes(7), signature: bytes(8), userHandle: null },
      getClientExtensionResults: () => ({}),
    }) } });
    await expect(passkeys.signInWithPasskey(true)).rejects.toThrow("This passkey didn't work.");
  });

  it("saves a new passkey with its label", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      rp: { id: "localhost", name: "HList" },
      user: { id: "AQ", name: "sam", displayName: "sam" },
      challenge: "AgM",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      excludeCredentials: [{ id: "BAU", type: "public-key", transports: ["internal"] }],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const create = vi.fn().mockResolvedValue({
      id: "Bgc", rawId: bytes(6, 7), type: "public-key", authenticatorAttachment: "platform",
      response: { attestationObject: bytes(8), clientDataJSON: bytes(9), getTransports: () => ["internal", "hybrid"] },
      getClientExtensionResults: () => ({ credProps: { rk: true } }),
    });
    vi.stubGlobal("navigator", { credentials: { create } });

    await passkeys.addPasskey("iPad");

    const options = (create.mock.calls[0][0] as CredentialCreationOptions).publicKey!;
    expect(new Uint8Array(options.user.id as ArrayBuffer)).toEqual(new Uint8Array([1]));
    expect(new Uint8Array(options.excludeCredentials![0].id as ArrayBuffer)).toEqual(new Uint8Array([4, 5]));
    const [path, init] = fetchMock.mock.calls[1];
    expect(path).toBe("/webauthn/register");
    expect(JSON.parse(init?.body as string)).toEqual({
      publicKey: {
        label: "iPad",
        credential: {
          id: "Bgc", rawId: "Bgc", type: "public-key", authenticatorAttachment: "platform",
          response: { attestationObject: "CA", clientDataJSON: "CQ", transports: ["internal", "hybrid"] },
          clientExtensionResults: { credProps: { rk: true } },
        },
      },
    });
  });

  it("explains when the device already has a passkey", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      rp: { id: "localhost", name: "HList" }, user: { id: "AQ", name: "sam", displayName: "sam" }, challenge: "AgM",
    }));
    vi.stubGlobal("navigator", { credentials: {
      create: vi.fn().mockRejectedValue(new DOMException("exists", "InvalidStateError")),
    } });
    await expect(passkeys.addPasskey("iPad")).rejects.toThrow("already has a passkey");
  });

  it("treats a dismissed Face ID sheet as cancelled, not as an error", () => {
    expect(passkeys.wasCancelled(new DOMException("cancelled", "NotAllowedError"))).toBe(true);
    expect(passkeys.wasCancelled(new DOMException("replaced", "AbortError"))).toBe(true);
    expect(passkeys.wasCancelled(new Error("Server down"))).toBe(false);
  });
});

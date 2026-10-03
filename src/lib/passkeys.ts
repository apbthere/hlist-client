// Passkeys (WebAuthn): sign in with Face ID or Touch ID instead of a password. Spring Security on the server
// handles the ceremonies; this module converts its JSON options to what navigator.credentials expects (binary
// fields as ArrayBuffers) and sends the browser's answer back as base64url JSON.
import { ApiError, request, send } from "../api/http";

export interface Passkey {
  /** The credential ID, base64url. */
  id: string;
  label: string;
  created: string | null;
  lastUsed: string | null;
}

export function toBase64url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function fromBase64url(text: string): ArrayBuffer {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let available: Promise<boolean> | null = null;

/**
 * Whether this page can use passkeys: the browser supports them, and the server accepts them from this address.
 * A passkey belongs to the server's public domain, so a LAN address like http://192.168.0.24:8080 can't use one.
 */
export function passkeysAvailable(): Promise<boolean> {
  available ??= (async () => {
    if (typeof window === "undefined" || !window.isSecureContext || !window.PublicKeyCredential) return false;
    const response = await send<{ origins: string[] }>("/api/auth/passkeys").catch(() => null);
    return response?.data?.origins.includes(window.location.origin) ?? false;
  })();
  return available;
}

/** Whether Safari can offer passkeys in the username field's AutoFill. */
export async function autofillAvailable(): Promise<boolean> {
  return await passkeysAvailable()
    && typeof PublicKeyCredential.isConditionalMediationAvailable === "function"
    && await PublicKeyCredential.isConditionalMediationAvailable().catch(() => false);
}

/** True when the person cancelled the Face ID sheet, or another ceremony replaced this one. */
export function wasCancelled(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}

// One ceremony at a time: a pending AutoFill request blocks the browser from starting another one.
let ceremony: AbortController | null = null;

function newCeremony(): AbortSignal {
  ceremony?.abort();
  ceremony = new AbortController();
  return ceremony.signal;
}

/** Stops a pending passkey request, e.g. the AutoFill offer when the sign-in page closes. */
export function cancelPasskeyRequest(): void {
  ceremony?.abort();
  ceremony = null;
}

async function options<T>(path: string): Promise<T> {
  const response = await send<T>(path, { method: "POST" });
  if (!response.ok || !response.data) {
    throw new ApiError(response.status, response.message ?? "Can't use passkeys right now. Try again later.");
  }
  return response.data;
}

interface CredentialDescriptorJSON {
  id: string;
  type: "public-key";
  transports?: AuthenticatorTransport[];
}

function descriptors(list: CredentialDescriptorJSON[] | undefined): PublicKeyCredentialDescriptor[] {
  return (list ?? []).map((descriptor) => ({ ...descriptor, id: fromBase64url(descriptor.id) }));
}

/** A name for the passkey in the Account sheet's list, from the device that made it. */
export function deviceLabel(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints): string {
  if (/iPhone/.test(userAgent)) return "iPhone";
  // iPadOS Safari reports itself as a Mac; only the touch screen gives it away.
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "iPad";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  return "Passkey";
}

/** Creates a passkey for the signed-in user (Face ID / Touch ID) and saves it on the server. */
export async function addPasskey(label = deviceLabel()): Promise<void> {
  const json = await options<PublicKeyCredentialCreationOptions & {
    user: { id: string; name: string; displayName: string };
    challenge: string;
    excludeCredentials?: CredentialDescriptorJSON[];
  }>("/webauthn/register/options");
  const credential = await navigator.credentials.create({
    publicKey: {
      ...json,
      user: { ...json.user, id: fromBase64url(json.user.id) },
      challenge: fromBase64url(json.challenge),
      excludeCredentials: descriptors(json.excludeCredentials),
    },
    signal: newCeremony(),
  }).catch((error: unknown) => {
    // The server lists the account's passkeys so the device doesn't save a second one.
    if (error instanceof DOMException && error.name === "InvalidStateError") {
      throw new Error("This device already has a passkey for your account.");
    }
    throw error;
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey was created.");

  const response = credential.response as AuthenticatorAttestationResponse;
  await request("/webauthn/register", {
    method: "POST",
    body: {
      publicKey: {
        label,
        credential: {
          id: credential.id,
          rawId: toBase64url(credential.rawId),
          type: credential.type,
          response: {
            attestationObject: toBase64url(response.attestationObject),
            clientDataJSON: toBase64url(response.clientDataJSON),
            transports: response.getTransports?.() ?? [],
          },
          clientExtensionResults: credential.getClientExtensionResults(),
          authenticatorAttachment: credential.authenticatorAttachment,
        },
      },
    },
  });
}

/**
 * Signs in with a passkey. With `autofill`, the request waits quietly until the person picks the passkey in
 * the username field's AutoFill (the field needs autocomplete="username webauthn"); otherwise Safari shows its
 * passkey sheet right away. `rememberMe` may be a function, read once a passkey is chosen. Resolves once the
 * server has signed the person in.
 */
export async function signInWithPasskey(rememberMe: boolean | (() => boolean), autofill = false): Promise<void> {
  const json = await options<PublicKeyCredentialRequestOptions & {
    challenge: string;
    allowCredentials?: CredentialDescriptorJSON[];
  }>("/webauthn/authenticate/options");
  const credential = await navigator.credentials.get({
    publicKey: {
      ...json,
      challenge: fromBase64url(json.challenge),
      allowCredentials: descriptors(json.allowCredentials),
    },
    mediation: autofill ? "conditional" : undefined,
    signal: newCeremony(),
  }) as PublicKeyCredential | null;
  if (!credential) throw new DOMException("No passkey was chosen.", "NotAllowedError");

  const response = credential.response as AuthenticatorAssertionResponse;
  // Read "Keep Me Signed In" now: with AutoFill, the person may have changed it while the request waited.
  const remember = typeof rememberMe === "function" ? rememberMe() : rememberMe;
  const result = await send<void>(`/login/webauthn?remember-me=${remember}`, {
    method: "POST",
    body: {
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      type: credential.type,
      response: {
        authenticatorData: toBase64url(response.authenticatorData),
        clientDataJSON: toBase64url(response.clientDataJSON),
        signature: toBase64url(response.signature),
        userHandle: response.userHandle ? toBase64url(response.userHandle) : undefined,
      },
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment,
    },
  });
  if (!result.ok) throw new ApiError(result.status, result.message ?? "Couldn't sign in with this passkey.");
}

export function getPasskeys(): Promise<Passkey[]> {
  return request("/api/users/me/passkeys");
}

export function deletePasskey(id: string): Promise<void> {
  return request(`/api/users/me/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

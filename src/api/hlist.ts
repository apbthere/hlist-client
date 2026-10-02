import { ApiError, request, send } from "./http";
import type { Brand, Department, Item, ItemRequest, ListItem, Page, ShoppingList, User } from "./types";

// Auth

export async function login(username: string, password: string, rememberMe: boolean): Promise<void> {
  const response = await send<void>("/api/auth/login", {
    method: "POST",
    form: { username, password, "remember-me": rememberMe ? "true" : "false" },
  });
  if (!response.ok) throw new ApiError(response.status, response.message ?? "Sign in failed");
}

export async function register(username: string, password: string, inviteCode?: string): Promise<void> {
  const body = inviteCode ? { username, password, inviteCode } : { username, password };
  const response = await send<User>("/api/users", { method: "POST", body });
  if (!response.ok) throw new ApiError(response.status, response.message ?? "Could not create the account");
}

/** Whether creating an account needs an invite code (set on the server with HLIST_INVITE_CODE). */
export async function inviteRequired(): Promise<boolean> {
  const response = await send<{ inviteRequired: boolean }>("/api/auth/registration");
  return response.data?.inviteRequired ?? false;
}

export interface ServerBuild {
  serverCommit: string;
  clientCommit: string;
  builtAt: string | null;
}

/** Which build the server is running (GET /api/version). */
export async function serverBuild(): Promise<ServerBuild | null> {
  const response = await send<ServerBuild>("/api/version");
  return response.ok ? response.data : null;
}

export async function logout(): Promise<void> {
  await send<void>("/api/auth/logout", { method: "POST" });
}

/** The signed-in user, or null if there is neither a session nor a valid remember-me cookie. */
export async function currentUser(): Promise<User | null> {
  const response = await send<User>("/api/users/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError(response.status, response.message ?? "Could not load your account");
  return response.data;
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request("/api/users/me/password", { method: "PUT", body: { currentPassword, newPassword } });
}

// Shopping lists

export function getLists(page: number, size: number): Promise<Page<ShoppingList>> {
  return request(`/api/shopping-lists?page=${page}&size=${size}`);
}

export function createList(name: string): Promise<ShoppingList> {
  return request("/api/shopping-lists", { method: "POST", body: { name } });
}

export function setListCompleted(listId: number, completed: boolean): Promise<void> {
  return request(`/api/shopping-lists/${listId}/completion`, { method: "PATCH", body: { completed } });
}

// Items on a list

export function getListItems(listId: number): Promise<ListItem[]> {
  return request(`/api/shopping-lists/${listId}/items`);
}

export function addItem(listId: number, item: ItemRequest): Promise<Item> {
  return request(`/api/shopping-lists/${listId}/items`, { method: "POST", body: item });
}

export function updateItem(listId: number, itemId: number, item: ItemRequest): Promise<Item> {
  return request(`/api/shopping-lists/${listId}/items/${itemId}`, { method: "PUT", body: item });
}

export function setItemCompleted(listId: number, itemId: number, completed: boolean): Promise<void> {
  return request(`/api/shopping-lists/${listId}/items/${itemId}/completion`, {
    method: "PATCH",
    body: { completed },
  });
}

export function removeItem(listId: number, itemId: number): Promise<void> {
  return request(`/api/shopping-lists/${listId}/items/${itemId}`, { method: "DELETE" });
}

// Photos

export interface PhotoInfo {
  photoId: number;
  width: number;
  height: number;
}

/** Uploads a picture (the server re-encodes it and makes a thumbnail); attach it with setItemPhoto. */
export function uploadPhoto(picture: Blob): Promise<PhotoInfo> {
  return request("/api/photos", { method: "POST", raw: picture });
}

/** A downloaded photo; from a product page, also the product's name (without the brand) and brand. */
export interface ImportedPhoto extends PhotoInfo {
  title?: string | null;
  brand?: string | null;
}

/** Has the server download a picture: an image's web address, or a product page's link (its product photo). */
export function importPhoto(url: string): Promise<ImportedPhoto> {
  return request("/api/photos/import", { method: "POST", body: { url } });
}

/** A product photo found by name and brand (from Open Food Facts); attach it with importPhoto(imageUrl). */
export interface PhotoSuggestion {
  name: string;
  brand: string | null;
  thumbnailUrl: string;
  imageUrl: string;
}

export function findPhotos(name: string, brand?: string | null): Promise<PhotoSuggestion[]> {
  const query = new URLSearchParams({ name });
  if (brand) query.set("brand", brand);
  return request(`/api/photos/suggestions?${query}`);
}

export function setItemPhoto(itemId: number, photoId: number): Promise<void> {
  return request(`/api/items/${itemId}/photo`, { method: "PUT", body: { photoId } });
}

export function removeItemPhoto(itemId: number): Promise<void> {
  return request(`/api/items/${itemId}/photo`, { method: "DELETE" });
}

// Catalog

/** Every item the user has ever added, used for suggestions. */
export function getPreviousItems(): Promise<Item[]> {
  return request("/api/items");
}

export function getDepartments(): Promise<Department[]> {
  return request("/api/departments");
}

export function createDepartment(name: string): Promise<Department> {
  return request("/api/departments", { method: "POST", body: { name } });
}

export function getBrands(): Promise<Brand[]> {
  return request("/api/brands");
}

export function createBrand(name: string): Promise<Brand> {
  return request("/api/brands", { method: "POST", body: { name } });
}

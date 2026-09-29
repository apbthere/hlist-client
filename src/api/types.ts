// Shapes returned by the HList server (see the server's model and controller records).

export interface User {
  username: string;
}

export interface ShoppingList {
  shoppingListId: number;
  shoppingListName: string;
  username: string;
  completed: boolean;
  /** ISO timestamp set by the server when the list was created. */
  createdAt?: string;
  updatedAt?: string;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

/** An item as it appears on a specific list (includes that list's completion state). */
export interface ListItem {
  itemId: number;
  itemName: string;
  quantity: number | null;
  departmentId: number | null;
  brandId: number | null;
  itemComment: string | null;
  username: string;
  completed: boolean;
  /** When the item was added to this list. */
  createdAt?: string;
  /** When the item's entry on this list last changed, e.g. was checked off. */
  updatedAt?: string;
}

/** An item record owned by the user, independent of any list. */
export interface Item {
  itemId: number;
  itemName: string;
  quantity: number | null;
  departmentId: number | null;
  brandId: number | null;
  itemComment: string | null;
  username: string;
}

export interface Department {
  departmentId: number;
  departmentName: string;
}

export interface Brand {
  brandId: number;
  brandName: string;
}

export interface ItemRequest {
  name: string;
  quantity: number;
  departmentId: number | null;
  brandId: number | null;
  comment: string | null;
}

// Shapes returned by the HList server (see the server's model and controller records).

export interface User {
  username: string;
}

export interface ShoppingList {
  shoppingListId: number;
  shoppingListName: string;
  username: string;
  completed: boolean;
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

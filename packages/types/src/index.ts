export interface ApiHealthResponse {
  service: 'mensah-rentals-api';
  status: 'ok';
}

export interface DatabaseHealthResponse {
  database: 'connected';
  status: 'ok';
}

export type StaffUserStatus = 'ACTIVE' | 'DISABLED';

export interface StaffRoleSummary {
  displayName: string;
  id: string;
  name: string;
}

export interface StaffUserResponse {
  createdAt: string;
  email: string;
  firstName: string;
  id: string;
  lastLoginAt: string | null;
  lastName: string;
  permissionKeys: string[];
  roles: StaffRoleSummary[];
  status: StaffUserStatus;
  updatedAt: string;
}

export interface PermissionResponse {
  createdAt: string;
  description: string;
  id: string;
  key: string;
}

export interface RoleResponse extends StaffRoleSummary {
  createdAt: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  updatedAt: string;
}

export interface RoleDetailResponse extends RoleResponse {
  permissions: PermissionResponse[];
}

export interface StaffAuthResponse {
  user: StaffUserResponse;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface AdminCategoryResponse {
  createdAt: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  productCount: number;
  slug: string;
  sortOrder: number;
  updatedAt: string;
}

export interface AdminProductImageResponse {
  altText: string;
  createdAt: string;
  id: string;
  isPrimary: boolean;
  sortOrder: number;
  url: string;
}

export interface AdminProductSpecificationResponse {
  id: string;
  label: string;
  sortOrder: number;
  value: string;
}

export interface AdminProductResponse {
  category: Pick<AdminCategoryResponse, 'id' | 'name' | 'slug'>;
  categoryId: string;
  createdAt: string;
  description: string | null;
  id: string;
  images: AdminProductImageResponse[];
  isActive: boolean;
  isFeatured: boolean;
  name: string;
  rentalUnit: string;
  shortDescription: string;
  slug: string;
  specifications: AdminProductSpecificationResponse[];
  updatedAt: string;
}

export interface PublicCategoryResponse {
  description: string | null;
  name: string;
  slug: string;
}

export interface PublicProductImageResponse {
  altText: string;
  isPrimary: boolean;
  url: string;
}

export interface PublicProductSummaryResponse {
  category: PublicCategoryResponse;
  images: PublicProductImageResponse[];
  isFeatured: boolean;
  name: string;
  rentalUnit: string;
  shortDescription: string;
  slug: string;
}

export interface PublicProductDetailResponse
  extends PublicProductSummaryResponse {
  description: string | null;
  relatedProducts: PublicProductSummaryResponse[];
  specifications: Array<{ label: string; value: string }>;
}

export interface PublicCartProductResponse {
  category: Pick<PublicCategoryResponse, 'name' | 'slug'>;
  image: PublicProductImageResponse | null;
  name: string;
  rentalUnit: string;
  requestable: boolean;
  shortDescription: string;
  slug: string;
}

export interface PublicCartItemResponse {
  desiredQuantity: number;
  product: PublicCartProductResponse;
}

export interface PublicCartResponse {
  desiredUnitCount: number;
  distinctItemCount: number;
  items: PublicCartItemResponse[];
}

export type InventoryTrackingModeResponse = 'BULK' | 'SERIALIZED';
export type InventoryStateResponse =
  | 'RENTABLE'
  | 'RENTED'
  | 'MAINTENANCE'
  | 'DAMAGED'
  | 'LOST'
  | 'RETIRED';

export interface AdminInventoryMetadataResponse {
  createdAt: string;
  id: string;
  product: { id: string; name: string; slug: string };
  trackingMode: InventoryTrackingModeResponse;
  updatedAt: string;
}

export interface AdminInventoryQuantityResponse {
  inventoryId: string;
  states: Record<InventoryStateResponse, number>;
  totalQuantity: number;
}

export interface AdminInventoryItemResponse {
  assetNumber: string;
  createdAt: string;
  id: string;
  serialNumber: string | null;
  status: InventoryStateResponse;
  updatedAt: string;
}

export interface AdminInventoryTransactionResponse {
  actor: { firstName: string; id: string; lastName: string };
  createdAt: string;
  fromState: InventoryStateResponse | null;
  id: string;
  inventoryItemId: string | null;
  kind:
    | 'INITIAL_STOCK'
    | 'BULK_MOVEMENT'
    | 'SERIALIZED_ITEM_CREATED'
    | 'SERIALIZED_ITEM_STATE_CHANGED';
  operationId: string;
  quantity: number;
  reason: string;
  toState: InventoryStateResponse | null;
}

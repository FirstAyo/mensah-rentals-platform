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

export type PublicRentalRequestFulfillmentMethod =
  | 'PICKUP'
  | 'DELIVERY'
  | 'DELIVERY_AND_SETUP';

export interface PublicRentalRequestItemResponse {
  approvedQuantity?: number;
  categoryName: string;
  categorySlug: string;
  productName: string;
  productSlug: string;
  rentalUnit: string;
  requestedQuantity: number;
}

export type PublicRentalRequestDecisionOutcome =
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED';

export interface PublicRentalRequestDecisionResponse {
  customerExplanation: string | null;
  decidedAt: string;
  notice: string;
  outcome: PublicRentalRequestDecisionOutcome;
}

export type PublicRentalRequestStatus =
  | { key: 'REQUEST_SUBMITTED'; label: 'Request submitted' }
  | { key: 'UNDER_REVIEW'; label: 'Under review' }
  | { key: 'APPROVED'; label: 'Request approved' }
  | { key: 'PARTIALLY_APPROVED'; label: 'Request partially approved' }
  | { key: 'REJECTED'; label: 'Request not approved' };

export interface PublicRentalRequestResponse {
  decision: PublicRentalRequestDecisionResponse | null;
  fulfillmentMethod: PublicRentalRequestFulfillmentMethod;
  items: PublicRentalRequestItemResponse[];
  projectName: string;
  referenceNumber: string;
  rentalEndDate: string;
  rentalStartDate: string;
  status: PublicRentalRequestStatus;
  submittedAt: string;
}

export type AdminRentalRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED';

export interface AdminRentalRequestStaffSummary {
  firstName: string;
  id: string;
  lastName: string;
}

export type AdminRentalRequestAssigneeResponse = AdminRentalRequestStaffSummary;

export interface AdminRentalRequestSummaryResponse {
  assignedTo: AdminRentalRequestStaffSummary | null;
  companyName: string | null;
  contactEmail: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  fulfillmentMethod: PublicRentalRequestFulfillmentMethod;
  id: string;
  projectName: string;
  referenceNumber: string;
  rentalEndDate: string;
  rentalStartDate: string;
  reviewVersion: number;
  status: AdminRentalRequestStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface AdminRentalRequestInventoryContext {
  notice: string;
  states: Record<InventoryStateResponse, number>;
  totalQuantity: number;
  trackingMode: InventoryTrackingModeResponse;
}

export interface AdminRentalRequestItemResponse {
  categoryName: string;
  categorySlug: string;
  id: string;
  inventoryContext?: AdminRentalRequestInventoryContext;
  productId: string;
  productName: string;
  productSlug: string;
  rentalUnit: string;
  requestedQuantity: number;
}

export interface AdminRentalRequestDetailResponse
  extends AdminRentalRequestSummaryResponse {
  assignedAt: string | null;
  customerNotes: string | null;
  deliveryAddress: string | null;
  items: AdminRentalRequestItemResponse[];
  projectLocation: string;
  projectType: string;
  requestedTimeZone: string;
  reviewStartedAt: string | null;
}

export interface AdminRentalRequestNoteResponse {
  author: AdminRentalRequestStaffSummary;
  body: string;
  createdAt: string;
  id: string;
}

export type AdminRentalRequestActivityType =
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'UNASSIGNED'
  | 'NOTE_ADDED'
  | 'REVIEW_STARTED'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED';

export interface AdminRentalRequestActivityResponse {
  actor: AdminRentalRequestStaffSummary | null;
  createdAt: string;
  id: string;
  newAssignee: AdminRentalRequestStaffSummary | null;
  newStatus: AdminRentalRequestStatus | null;
  noteId: string | null;
  previousAssignee: AdminRentalRequestStaffSummary | null;
  previousStatus: AdminRentalRequestStatus | null;
  type: AdminRentalRequestActivityType;
}

export interface AdminRentalRequestDecisionItemResponse {
  approvedQuantity: number;
  id: string;
  rentalRequestItemId: string;
  requestedQuantitySnapshot: number;
}

export interface AdminRentalRequestDecisionResponse {
  customerExplanation: string | null;
  decidedAt: string;
  decidedBy: AdminRentalRequestStaffSummary;
  id: string;
  internalReason: string;
  items: AdminRentalRequestDecisionItemResponse[];
  outcome: PublicRentalRequestDecisionOutcome;
  quoteEligible: boolean;
  reviewVersionAfter: number;
  reviewVersionBefore: number;
}

export type QuoteRevisionStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export interface QuoteMoneyResponse {
  chargeTotalCents: number;
  discountCents: number;
  itemSubtotalCents: number;
  subtotalCents: number;
  taxableSubtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export interface AdminQuoteItemResponse {
  approvedQuantity: number;
  categoryName: string;
  categorySlug: string;
  decisionItemId: string;
  id: string;
  lineSubtotalCents: number;
  productName: string;
  productSlug: string;
  quotedQuantity: number;
  rentalUnit: string;
  sortOrder: number;
  taxable: boolean;
  unitPriceCents: number;
}

export interface AdminQuoteChargeResponse {
  amountCents: number;
  id: string;
  label: string;
  sortOrder: number;
  taxable: boolean;
  type: 'DELIVERY' | 'PICKUP' | 'SETUP' | 'TEARDOWN' | 'LABOUR' | 'OTHER';
}

export interface AdminQuoteRevisionResponse extends QuoteMoneyResponse {
  charges: AdminQuoteChargeResponse[];
  createdAt: string;
  createdBy: AdminRentalRequestStaffSummary;
  currency: 'CAD';
  customerNotes: string | null;
  customerResponse: {
    note: string | null;
    respondedAt: string;
    response: 'ACCEPTED' | 'REJECTED';
  } | null;
  discountTaxable: boolean;
  id: string;
  internalNotes: string | null;
  items: AdminQuoteItemResponse[];
  lifecycleVersion: number;
  revisionNumber: number;
  sentAt: string | null;
  status: QuoteRevisionStatus;
  tax: {
    name: string;
    rateBasisPoints: number;
    taxAmountCents: number;
    taxableAmountCents: number;
  };
  terms: string | null;
  validUntil: string;
  viewedAt: string | null;
}

export interface AdminQuoteSummaryResponse {
  createdAt: string;
  customerName: string;
  id: string;
  quoteNumber: string;
  rentalRequestId: string;
  rentalRequestReference: string;
  revisionNumber: number;
  status: QuoteRevisionStatus;
  totalCents: number;
  validUntil: string;
}

export interface AdminQuoteDetailResponse {
  createdAt: string;
  customer: { companyName: string | null; name: string };
  customerRevisionId: string | null;
  id: string;
  latestRevisionId: string;
  notice: string;
  order: { id: string; orderNumber: string } | null;
  quoteNumber: string;
  rentalRequest: {
    id: string;
    referenceNumber: string;
    rentalEndDate: string;
    rentalStartDate: string;
  };
  revisions: AdminQuoteRevisionResponse[];
}

export interface AdminQuoteSendResponse {
  accessLink: string;
  quoteId: string;
  revisionId: string;
  status: 'SENT';
}

export interface PublicQuoteResponse extends QuoteMoneyResponse {
  charges: Array<{
    amountCents: number;
    label: string;
    taxable: boolean;
    type: AdminQuoteChargeResponse['type'];
  }>;
  currency: 'CAD';
  customerName: string;
  customerNotes: string | null;
  items: Array<{
    approvedQuantity: number;
    lineSubtotalCents: number;
    productName: string;
    productSlug: string;
    quotedQuantity: number;
    rentalUnit: string;
    taxable: boolean;
    unitPriceCents: number;
  }>;
  notice: string;
  quoteNumber: string;
  rentalEndDate: string;
  rentalStartDate: string;
  revisionNumber: number;
  status: Exclude<QuoteRevisionStatus, 'DRAFT'>;
  tax: {
    name: string;
    rateBasisPoints: number;
    taxAmountCents: number;
    taxableAmountCents: number;
  };
  terms: string | null;
  validUntil: string;
}

export type RentalOrderStatusResponse = 'CONFIRMED';
export type RentalOrderReservationStatusResponse = 'NOT_RESERVED';

export interface AdminRentalOrderSummaryResponse extends QuoteMoneyResponse {
  confirmedAt: string;
  customerName: string;
  fulfillmentMethod: PublicRentalRequestFulfillmentMethod;
  id: string;
  orderNumber: string;
  quoteId: string;
  quoteNumber: string;
  rentalEndDate: string;
  rentalRequestId: string;
  rentalRequestReference: string;
  rentalStartDate: string;
  reservationStatus: RentalOrderReservationStatusResponse;
  status: RentalOrderStatusResponse;
}

export interface AdminRentalOrderItemResponse
  extends Omit<AdminQuoteItemResponse, 'decisionItemId'> {
  sourceQuoteRevisionItemId: string;
}

export interface AdminRentalOrderDetailResponse
  extends AdminRentalOrderSummaryResponse {
  acceptedQuoteRevisionId: string;
  acceptedRevisionNumber: number;
  activities: Array<{
    actor: AdminRentalRequestStaffSummary | null;
    createdAt: string;
    id: string;
    type: 'ORDER_CREATED' | 'ORDER_CUSTOMER_ACCESS_CREATED' | 'ORDER_VIEWED';
  }>;
  charges: AdminQuoteChargeResponse[];
  confirmedBy: AdminRentalRequestStaffSummary;
  currency: 'CAD';
  customer: {
    companyName: string | null;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  deliveryAddress: string | null;
  discountTaxable: boolean;
  items: AdminRentalOrderItemResponse[];
  notice: string;
  project: {
    customerNotes: string | null;
    location: string;
    name: string;
    requestedTimeZone: string;
    type: string;
  };
  quoteCustomerNotes: string | null;
  rentalRequestDecisionId: string;
  tax: AdminQuoteRevisionResponse['tax'];
  terms: string | null;
}

export interface AdminRentalOrderCreateResponse {
  customerAccessLink: string;
  order: { id: string; orderNumber: string };
}

export interface PublicRentalOrderResponse extends QuoteMoneyResponse {
  charges: Array<{
    amountCents: number;
    label: string;
    taxable: boolean;
    type: AdminQuoteChargeResponse['type'];
  }>;
  companyName: string | null;
  confirmedAt: string;
  currency: 'CAD';
  customerName: string;
  customerNotes: string | null;
  deliveryAddress: string | null;
  fulfillmentMethod: PublicRentalRequestFulfillmentMethod;
  items: Array<{
    approvedQuantity: number;
    lineSubtotalCents: number;
    productName: string;
    productSlug: string;
    quotedQuantity: number;
    rentalUnit: string;
    taxable: boolean;
    unitPriceCents: number;
  }>;
  notice: string;
  orderNumber: string;
  projectLocation: string;
  projectName: string;
  projectNotes: string | null;
  projectType: string;
  rentalEndDate: string;
  rentalStartDate: string;
  reservationStatus: RentalOrderReservationStatusResponse;
  status: RentalOrderStatusResponse;
  tax: AdminQuoteRevisionResponse['tax'];
  terms: string | null;
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

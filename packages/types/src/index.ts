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
  | { key: 'RE_REVIEW_REQUIRED'; label: 'Changes awaiting review' }
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
  currentRevisionNumber?: number;
  amendmentAllowed?: boolean;
  formalChangeRequestAllowed?: boolean;
}

export type AdminRentalRequestStatus =
  | 'SUBMITTED'
  | 'RE_REVIEW_REQUIRED'
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
  | 'REJECTED'
  | 'AMENDMENT_SUBMITTED'
  | 'RE_REVIEW_STARTED'
  | 'DECISION_SUPERSEDED'
  | 'QUOTE_SUPERSEDED'
  | 'QUOTE_ACCESS_REVOKED'
  | 'CHANGE_REQUEST_SUBMITTED'
  | 'CHANGE_REQUEST_REVIEWED';

export type RentalRequestRevisionSubmittedBy =
  | 'ORIGINAL_SUBMISSION'
  | 'CUSTOMER'
  | 'STAFF';
export type RentalRequestItemChangeKind =
  | 'ADDED'
  | 'REMOVED'
  | 'QUANTITY_INCREASED'
  | 'QUANTITY_DECREASED'
  | 'UNCHANGED';

export interface RentalRequestRevisionItemResponse {
  categoryName: string;
  categorySlug: string;
  id: string;
  productId: string | null;
  productName: string;
  productSlug: string;
  rentalUnit: string;
  requestedQuantity: number;
  sortOrder: number;
}

export interface PublicRentalRequestRevisionResponse {
  amendmentReason: string | null;
  amendmentAllowed: boolean;
  companyName: string | null;
  contactEmail: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  customerNotes: string | null;
  createdAt: string;
  deliveryAddress: string | null;
  formalChangeRequestAllowed: boolean;
  fulfillmentMethod: PublicRentalRequestFulfillmentMethod;
  id: string;
  items: RentalRequestRevisionItemResponse[];
  projectLocation: string;
  projectName: string;
  projectType: string;
  referenceNumber: string;
  rentalEndDate: string;
  rentalStartDate: string;
  requestedTimeZone: string;
  revisionNumber: number;
  status: PublicRentalRequestStatus;
}

export interface RentalRequestRevisionComparisonResponse {
  fields: Array<{
    field: string;
    previousValue: string | null;
    currentValue: string | null;
    kind: 'FIELD_CHANGED';
  }>;
  items: Array<{
    kind: RentalRequestItemChangeKind;
    productName: string;
    productSlug: string;
    previousQuantity: number | null;
    currentQuantity: number | null;
  }>;
}

export interface AdminRentalRequestRevisionResponse
  extends Omit<
    PublicRentalRequestRevisionResponse,
    'amendmentAllowed' | 'formalChangeRequestAllowed' | 'status'
  > {
  submittedByType: RentalRequestRevisionSubmittedBy;
}

export type RentalChangeRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED_FOR_REQUOTE'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'SUPERSEDED';

export interface PublicRentalChangeRequestResponse {
  companyName: string | null;
  contactEmail: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  createdAt: string;
  customerNotes: string | null;
  deliveryAddress: string | null;
  fulfillmentMethod: PublicRentalRequestFulfillmentMethod;
  id: string;
  items: Array<
    RentalRequestRevisionItemResponse & {
      changeType: 'ADDED' | 'REMOVED' | 'QUANTITY_CHANGED' | 'UNCHANGED';
      previousQuantity: number | null;
      proposedQuantity: number | null;
    }
  >;
  projectLocation: string;
  projectName: string;
  projectType: string;
  reason: string;
  rentalEndDate: string;
  rentalStartDate: string;
  requestedTimeZone: string;
  status: RentalChangeRequestStatus;
  source: 'ACCEPTED_QUOTE' | 'CONFIRMED_ORDER';
}

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
  discountBaseCents: number;
  discountRateBasisPoints: number | null;
  discountType: 'FIXED_AMOUNT' | 'PERCENTAGE';
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
  taxableDiscountCents: number;
  draftVersion: number;
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
  accessId: string;
  deliveryMode: 'SECURE_TEST_LINK';
  expiresAt: string;
  quoteId: string;
  revisionId: string;
  status: 'SENT' | 'VIEWED';
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
export type RentalOrderReservationStatusResponse =
  | 'NOT_RESERVED'
  | 'PARTIALLY_RESERVED'
  | 'RESERVED'
  | 'RESERVATION_FAILED'
  | 'RELEASED'
  | 'PARTIALLY_CONSUMED'
  | 'CONSUMED';

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
  reservationStatus?: RentalOrderReservationStatusResponse;
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
  reservationVersion: number;
  activities: Array<{
    actor: AdminRentalRequestStaffSummary | null;
    createdAt: string;
    id: string;
    type:
      | 'ORDER_CREATED'
      | 'ORDER_CUSTOMER_ACCESS_CREATED'
      | 'ORDER_VIEWED'
      | 'ORDER_CUSTOMER_ACCESS_REVOKED'
      | 'ORDER_CUSTOMER_ACCESS_ROTATED'
      | 'ORDER_CUSTOMER_ACCESS_RESENT';
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
  taxableDiscountCents: number;
  customerAccess: AdminCustomerAccessStatus;
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
  order: { id: string; orderNumber: string };
}

export type CustomerAccessState = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface AdminCustomerAccessStatus {
  accessId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  firstViewedAt: string | null;
  state: CustomerAccessState;
}

export interface AdminCustomerAccessMutationResponse {
  access: AdminCustomerAccessStatus;
  accessLink: string | null;
  deliveryMode: 'SECURE_TEST_LINK' | null;
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
  status: RentalOrderStatusResponse;
  tax: AdminQuoteRevisionResponse['tax'];
  terms: string | null;
  customerFulfilmentStatus?: {
    key:
      | 'CONFIRMED'
      | 'PREPARING'
      | 'READY_FOR_PICKUP'
      | 'READY_FOR_DELIVERY'
      | 'OUT_FOR_DELIVERY'
      | 'RENTAL_ACTIVE'
      | 'PARTIALLY_RECEIVED'
      | 'RECEIVED_REVIEWING'
      | 'ISSUE_UNDER_REVIEW'
      | 'COMPLETED';
    label: string;
  };
  expectedReturnDate?: string | null;
  checkedOutItems?: Array<{
    productName: string;
    quantity: number;
    rentalUnit: string;
  }>;
  returnSummary?: {
    returnedQuantity: number;
    outstandingQuantity: number;
    status:
      | 'PARTIALLY_RECEIVED'
      | 'RECEIVED_REVIEWING'
      | 'ISSUE_UNDER_REVIEW'
      | 'COMPLETED';
    customerSafeMessage: string;
  } | null;
}

export interface AdminWorkSummaryResponse {
  generatedAt: string;
  rentalRequests?: {
    approvedAwaitingQuote?: number;
    submittedAwaitingReview: number;
    underReview: number;
  };
  quotes?: {
    acceptedAwaitingOrder?: number;
    sentAwaitingResponse: number;
  };
  orders?: {
    upcomingRentalDates: number;
  };
  reservations?: {
    awaitingReservation: number;
    fullyReserved: number;
    partiallyReserved: number;
    unresolvedShortfallQuantity: number;
    upcomingReservations: number;
  };
  fulfilment?: {
    awaitingPreparation: number;
    preparing: number;
    readyForPickup: number;
    readyForDelivery: number;
    partiallyCheckedOut: number;
  };
  activeRentals?: {
    active: number;
    expectedReturnsToday: number;
    overdue: number;
  };
  returns?: {
    partiallyReturned: number;
    awaitingReconciliation: number;
    readyToComplete: number;
  };
  returnIssues?: {
    missing: number;
    damaged: number;
    unresolved: number;
  };
}

export type OrderFulfilmentStatusResponse =
  | 'PREPARING'
  | 'READY'
  | 'PARTIALLY_CHECKED_OUT'
  | 'CHECKED_OUT';
export type ActiveRentalStatusResponse =
  | 'PARTIALLY_ACTIVE'
  | 'ACTIVE'
  | 'PARTIALLY_RETURNED'
  | 'AWAITING_RECONCILIATION'
  | 'COMPLETED';

export interface AdminFulfilmentItemResponse {
  id: string;
  rentalOrderItemId: string;
  productName: string;
  trackingMode: InventoryTrackingModeResponse;
  orderedQuantity: number;
  reservedQuantity: number;
  consumedQuantity: number;
  shortfallQuantity: number;
  preparedQuantity: number;
  checkedOutQuantity: number;
  remainingCommercialQuantity: number;
  serializedAllocations: Array<{
    allocationId: string;
    assetNumber: string;
    prepared: boolean;
    serialNumber: string | null;
    status: 'ACTIVE' | 'CONSUMED';
  }>;
}

export interface AdminFulfilmentResponse {
  id: string;
  orderId: string;
  orderNumber: string;
  status: OrderFulfilmentStatusResponse;
  fulfilmentMethod: PublicRentalRequestFulfillmentMethod;
  version: number;
  reservationVersion: number;
  preparationStartedAt: string;
  readyAt: string | null;
  firstCheckedOutAt: string | null;
  fullyCheckedOutAt: string | null;
  items: AdminFulfilmentItemResponse[];
  activities: Array<{
    id: string;
    type:
      | 'PREPARATION_STARTED'
      | 'PREPARATION_UPDATED'
      | 'MARKED_READY'
      | 'CHECKOUT';
    createdAt: string;
    actor: AdminRentalRequestStaffSummary;
    internalReason: string | null;
  }>;
  activeRental: {
    id: string;
    status: ActiveRentalStatusResponse;
    expectedReturnAt: string;
  } | null;
  notice: string;
}

export interface AdminActiveRentalSummaryResponse {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  projectName: string;
  status: ActiveRentalStatusResponse;
  fulfilmentMethod: PublicRentalRequestFulfillmentMethod;
  rentalStartAt: string;
  expectedReturnAt: string;
  checkedOutAt: string;
  overdue: boolean;
  itemCount: number;
}

export interface AdminActiveRentalDetailResponse
  extends AdminActiveRentalSummaryResponse {
  items: Array<{
    productName: string;
    rentalUnit: string;
    checkedOutQuantity: number;
    serializedAssets: Array<{
      assetNumber: string;
      serialNumber: string | null;
    }>;
  }>;
  handoffs: Array<{
    id: string;
    type: 'PICKUP' | 'DELIVERY';
    recipientName: string | null;
    destination: string | null;
    acknowledgementReference: string | null;
    handoffAt: string;
    actor: AdminRentalRequestStaffSummary;
    internalNotes: string | null;
  }>;
  expectedReturnDate: string;
  notice: string;
}

export interface AdminActiveRentalListResponse {
  items: AdminActiveRentalSummaryResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type InventoryReservationStatusResponse =
  | 'PENDING'
  | 'PARTIALLY_RESERVED'
  | 'RESERVED'
  | 'RELEASED'
  | 'RESERVATION_FAILED'
  | 'PARTIALLY_CONSUMED'
  | 'CONSUMED';

export interface AdminAvailabilityItemResponse {
  availableToReserve: number;
  eligibleSerializedAssetCount: number | null;
  inventoryId: string | null;
  orderedQuantity: number;
  overlappingReservedQuantity: number;
  physicalRentableQuantity: number;
  productId: string;
  productName: string;
  rentalOrderItemId: string;
  shortfallQuantity: number;
  trackingMode: InventoryTrackingModeResponse | null;
}

export interface AdminOrderAvailabilityResponse {
  calculatedAt: string;
  items: AdminAvailabilityItemResponse[];
  notice: string;
  orderId: string;
  rentalEndDate: string;
  rentalStartDate: string;
  requestedTimeZone: string;
}

export interface AdminReservationAllocationResponse {
  allocatedAt: string;
  allocationId: string;
  assetNumber: string;
  releasedAt: string | null;
  serialNumber: string | null;
  serializedAssetId: string;
  status: 'ACTIVE' | 'RELEASED' | 'CONSUMED';
}

export interface AdminReservationItemResponse {
  allocations: AdminReservationAllocationResponse[];
  productId: string;
  productName: string;
  rentalOrderItemId: string;
  requestedQuantity: number;
  reservedQuantity: number;
  shortfallQuantity: number;
  trackingMode: InventoryTrackingModeResponse;
}

export interface AdminReservationActivityResponse {
  actor: AdminRentalRequestStaffSummary | null;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown> | null;
  reason: string | null;
  type:
    | 'RESERVATION_CREATED'
    | 'RESERVATION_PARTIALLY_CREATED'
    | 'RESERVATION_COMPLETED'
    | 'RESERVATION_QUANTITY_ADDED'
    | 'SERIALIZED_ASSET_ALLOCATED'
    | 'SERIALIZED_ASSET_RELEASED'
    | 'RESERVATION_QUANTITY_RELEASED'
    | 'RESERVATION_RELEASED'
    | 'RESERVATION_FAILED'
    | 'RESERVATION_OVERRIDE_RECORDED';
}

export interface AdminInventoryReservationResponse {
  activities: AdminReservationActivityResponse[];
  createdAt: string;
  id: string;
  items: AdminReservationItemResponse[];
  orderId: string;
  orderNumber: string;
  overrideReason: string | null;
  rentalEndDate: string;
  rentalStartDate: string;
  reservationNumber: string;
  status: InventoryReservationStatusResponse;
  updatedAt: string;
  version: number;
}

export interface AdminEligibleSerializedAssetResponse {
  assetNumber: string;
  id: string;
  serialNumber: string | null;
}

export interface AdminEligibleAssetsResponse {
  items: AdminEligibleSerializedAssetResponse[];
  rentalOrderItemId: string;
}

export type InventoryTrackingModeResponse = 'BULK' | 'SERIALIZED';
export type InventoryStateResponse =
  | 'RENTABLE'
  | 'RENTED'
  | 'MAINTENANCE'
  | 'DAMAGED'
  | 'MISSING'
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

export type RentalReturnStatusResponse =
  | 'PARTIALLY_RETURNED'
  | 'RECONCILIATION_REQUIRED'
  | 'READY_TO_COMPLETE'
  | 'COMPLETED';

export interface AdminRentalReturnItemResponse {
  id: string;
  activeRentalItemId: string;
  productName: string;
  rentalUnit: string;
  trackingMode: InventoryTrackingModeResponse;
  expectedCheckedOutQuantity: number;
  receivedQuantity: number;
  rentableQuantity: number;
  damagedQuantity: number;
  maintenanceQuantity: number;
  missingQuantity: number;
  outstandingQuantity: number;
  serializedAssets: Array<{
    activeRentalSerializedAssetId: string;
    assetNumber: string;
    serialNumber: string | null;
    accounted: boolean;
    disposition: 'RENTABLE' | 'DAMAGED' | 'MAINTENANCE' | 'MISSING' | null;
  }>;
}

export interface AdminRentalReturnResponse {
  id: string;
  returnNumber: string;
  activeRentalId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  projectName: string;
  status: RentalReturnStatusResponse;
  version: number;
  firstReturnAt: string;
  fullyAccountedAt: string | null;
  reconciledAt: string | null;
  completedAt: string | null;
  items: AdminRentalReturnItemResponse[];
  issueCount: number;
  blockingIssueCount: number;
  notice: string;
}

export interface AdminRentalReturnListResponse {
  items: Array<
    Pick<
      AdminRentalReturnResponse,
      | 'id'
      | 'returnNumber'
      | 'activeRentalId'
      | 'orderId'
      | 'orderNumber'
      | 'customerName'
      | 'projectName'
      | 'status'
      | 'version'
      | 'firstReturnAt'
      | 'completedAt'
      | 'issueCount'
      | 'blockingIssueCount'
    >
  >;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminRentalIssueResponse {
  id: string;
  returnId: string;
  returnNumber: string;
  orderNumber: string;
  type:
    | 'MISSING'
    | 'DAMAGED'
    | 'MAINTENANCE_REQUIRED'
    | 'LATE_RETURN'
    | 'WRONG_ITEM_RETURNED'
    | 'UNRESOLVED_QUANTITY';
  status: string;
  version: number;
  quantity: number;
  openQuantity: number;
  blocksCompletion: boolean;
  internalDescription: string;
  customerSafeDescription: string | null;
  amountAssessedCents: string;
  amountPaidCents: string;
  productName: string | null;
  assetNumber: string | null;
  serialNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

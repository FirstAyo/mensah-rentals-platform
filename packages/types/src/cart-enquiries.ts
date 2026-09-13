import type { CustomerSubmissionMode } from '@mensah-rentals/validation';

export interface CustomerWorkflowSettingResponse {
  mode: CustomerSubmissionMode;
  updatedAt: string;
  version: number;
}

export interface PublicCartEnquiryReceiptResponse {
  accepted: true;
  message: string;
  referenceNumber: string | null;
}

export type CartEnquiryStatusResponse = 'NEW' | 'READ' | 'RESOLVED';
export type OutboundEmailStatusResponse =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED';

export interface AdminCartEnquirySummaryResponse {
  contactEmail: string;
  createdAt: string;
  customerName: string;
  deliveryStatus: OutboundEmailStatusResponse;
  id: string;
  referenceNumber: string;
  requestedUnitCount: number;
  status: CartEnquiryStatusResponse;
}

export interface AdminCartEnquiryItemResponse {
  categoryName: string;
  productName: string;
  productSlug: string;
  rentalUnit: string;
  requestedQuantity: number;
}

export interface AdminCartEnquiryResponse
  extends AdminCartEnquirySummaryResponse {
  additionalEquipment: string | null;
  company: string | null;
  contactPhone: string;
  customerNotes: string | null;
  delivery: {
    attemptCount: number;
    lastErrorMessage: string | null;
    status: OutboundEmailStatusResponse;
    updatedAt: string;
  };
  fulfilmentMethod: 'PICKUP' | 'DELIVERY' | 'DELIVERY_AND_SETUP';
  items: AdminCartEnquiryItemResponse[];
  location: string | null;
  projectName: string | null;
  rentalEndDate: string;
  rentalStartDate: string;
}

export interface AdminCartEnquiryListResponse {
  items: AdminCartEnquirySummaryResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

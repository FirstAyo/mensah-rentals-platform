import { describe, expect, it } from 'vitest';

import {
  approveRentalRequestDecisionSchema,
  createRentalRequestInternalNoteSchema,
  partiallyApproveRentalRequestDecisionSchema,
  rentalRequestAdminListQuerySchema,
  rejectRentalRequestDecisionSchema,
  unassignRentalRequestSchema,
  updateRentalRequestAssignmentSchema,
  updateRentalRequestReviewStateSchema,
} from './index';

const cuid = 'cm00000000000000000000000';

describe('administrative rental-request validation', () => {
  it('applies bounded list defaults and normalizes search', () => {
    expect(
      rentalRequestAdminListQuerySchema.parse({ search: '  Mensah  ' }),
    ).toMatchObject({
      assignment: 'ALL',
      page: 1,
      pageSize: 20,
      search: 'Mensah',
      sortBy: 'submittedAt',
      sortDirection: 'desc',
    });
    expect(
      rentalRequestAdminListQuerySchema.safeParse({ pageSize: 101 }).success,
    ).toBe(false);
    expect(
      rentalRequestAdminListQuerySchema.safeParse({ unknown: 'field' }).success,
    ).toBe(false);
  });

  it('rejects inverted rental-start filters', () => {
    const result = rentalRequestAdminListQuerySchema.safeParse({
      rentalStartFrom: '2026-09-02',
      rentalStartTo: '2026-09-01',
    });
    expect(result.success).toBe(false);
  });

  it('requires valid optimistic versions and strict assignment payloads', () => {
    expect(
      updateRentalRequestAssignmentSchema.parse({
        assigneeUserId: cuid,
        expectedVersion: 0,
      }),
    ).toEqual({ assigneeUserId: cuid, expectedVersion: 0 });
    expect(
      updateRentalRequestAssignmentSchema.safeParse({
        assigneeUserId: cuid,
        expectedVersion: -1,
      }).success,
    ).toBe(false);
    expect(
      unassignRentalRequestSchema.safeParse({
        expectedVersion: 0,
        actorId: cuid,
      }).success,
    ).toBe(false);
  });

  it('accepts only the supported review transition', () => {
    expect(
      updateRentalRequestReviewStateSchema.parse({
        status: 'UNDER_REVIEW',
        expectedVersion: 2,
      }),
    ).toEqual({ status: 'UNDER_REVIEW', expectedVersion: 2 });
    expect(
      updateRentalRequestReviewStateSchema.safeParse({
        status: 'APPROVED',
        expectedVersion: 2,
      }).success,
    ).toBe(false);
  });

  it('trims notes and requires a UUID idempotency key', () => {
    expect(
      createRentalRequestInternalNoteSchema.parse({
        operationId: '00000000-0000-4000-8000-000000000000',
        body: '  Call customer  ',
      }).body,
    ).toBe('Call customer');
    expect(
      createRentalRequestInternalNoteSchema.safeParse({
        operationId: 'not-a-uuid',
        body: 'Call customer',
      }).success,
    ).toBe(false);
    expect(
      createRentalRequestInternalNoteSchema.safeParse({
        operationId: '00000000-0000-4000-8000-000000000000',
        body: '   ',
      }).success,
    ).toBe(false);
  });

  it('validates strict approval, partial approval, and rejection payloads', () => {
    const common = {
      expectedReviewVersion: 1,
      internalReason: '  Documented internal reason  ',
      operationId: '00000000-0000-4000-8000-000000000000',
    };
    expect(approveRentalRequestDecisionSchema.parse(common)).toMatchObject({
      internalReason: 'Documented internal reason',
    });
    expect(
      partiallyApproveRentalRequestDecisionSchema.safeParse({
        ...common,
        customerExplanation: 'We can support part of your request.',
        items: [
          { approvedQuantity: 3, rentalRequestItemId: cuid },
          { approvedQuantity: 2, rentalRequestItemId: cuid },
        ],
      }).success,
    ).toBe(false);
    expect(
      rejectRentalRequestDecisionSchema.safeParse({
        ...common,
        customerExplanation: 'Only 2 items remain in inventory.',
      }).success,
    ).toBe(false);
    expect(
      rejectRentalRequestDecisionSchema.safeParse({
        ...common,
        customerExplanation: 'Only 12 units remain.',
      }).success,
    ).toBe(false);
    expect(
      rejectRentalRequestDecisionSchema.safeParse({
        ...common,
        customerExplanation: 'Another customer has equipment reserved.',
      }).success,
    ).toBe(false);
    expect(
      rejectRentalRequestDecisionSchema.safeParse({
        ...common,
        customerExplanation: 'We are unable to support this request.',
      }).success,
    ).toBe(true);
    for (const customerExplanation of [
      'Please contact us before 5 PM.',
      'Your event date can be moved to August 12.',
      'We can discuss an alternative package for 20 guests.',
      'Our staff will contact you about MR-2026-ABC123.',
      'This does not reserve equipment.',
    ])
      expect(
        rejectRentalRequestDecisionSchema.safeParse({
          ...common,
          customerExplanation,
        }).success,
      ).toBe(true);
    for (const customerExplanation of [
      'Only 12 units are available.',
      'Another customer reserved 30.',
      'Five units are damaged.',
      'Warehouse count is 42.',
      'We have twelve on hand.',
      'Only １２ units are available.',
      'The asset number is ABC-123.',
    ])
      expect(
        rejectRentalRequestDecisionSchema.safeParse({
          ...common,
          customerExplanation,
        }).success,
      ).toBe(false);
  });
});

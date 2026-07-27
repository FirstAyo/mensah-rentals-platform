import { describe, expect, it } from 'vitest';

import {
  createRentalRequestInternalNoteSchema,
  rentalRequestAdminListQuerySchema,
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
});

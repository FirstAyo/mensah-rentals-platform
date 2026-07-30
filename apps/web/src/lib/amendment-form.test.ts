import { describe, expect, it } from 'vitest';
import { submitRentalRequestAmendmentSchema } from '@mensah-rentals/validation';

import {
  AMENDMENT_REASON_ERROR,
  friendlyAmendmentSubmissionError,
  mapAmendmentValidationIssues,
  optionalText,
  requiredText,
} from './amendment-form';

describe('amendment form normalization and errors', () => {
  it('omits empty optional text and trims submitted text', () => {
    expect(optionalText('   ')).toBeNull();
    expect(optionalText('  Mensah Test  ')).toBe('Mensah Test');
    expect(requiredText('  Updated equipment plan  ')).toBe(
      'Updated equipment plan',
    );
  });

  it.each(['', '   \t'])(
    'maps an empty reason to a friendly field error',
    (reason) => {
      const result = submitRentalRequestAmendmentSchema.safeParse({
        amendmentReason: reason,
        companyName: null,
        contactEmail: 'customer@example.test',
        contactFirstName: 'Test',
        contactLastName: 'Customer',
        contactPhone: '+1 555 0100',
        customerNotes: null,
        deliveryAddress: null,
        expectedRevisionNumber: 1,
        fulfillmentMethod: 'PICKUP',
        items: [
          { productId: 'clz123456789012345678901', requestedQuantity: 2 },
        ],
        operationId: '123e4567-e89b-42d3-a456-426614174000',
        projectLocation: 'Studio A',
        projectName: 'Production',
        projectType: 'Film',
        rentalEndDate: '2026-09-11',
        rentalStartDate: '2026-09-10',
        requestedTimeZone: 'America/Toronto',
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      const mapped = mapAmendmentValidationIssues(
        result.error.issues,
        'amendment',
      );
      expect(mapped.fieldErrors.amendmentReason).toBe(AMENDMENT_REASON_ERROR);
      expect(mapped.summary).not.toMatch(/String must contain/i);
    },
  );

  it('never exposes an upstream validation message directly', () => {
    expect(friendlyAmendmentSubmissionError(400)).toBe(
      'Please review the amendment details and correct the highlighted fields.',
    );
  });
});

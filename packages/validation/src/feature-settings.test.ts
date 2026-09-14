import { describe, expect, it } from 'vitest';

import {
  FEATURE_DEPENDENCIES,
  FEATURE_PRESET_STATES,
  featureChangeSchema,
  isFeatureAvailable,
  platformFeatureKeys,
} from './feature-settings';

describe('platform feature contracts', () => {
  it('defines valid presets for every supported feature', () => {
    for (const preset of Object.values(FEATURE_PRESET_STATES)) {
      expect(Object.keys(preset).sort()).toEqual(
        [...platformFeatureKeys].sort(),
      );
    }
  });

  it('keeps Website + Email Enquiries as the safe launch preset without removing advanced operations', () => {
    expect(
      Object.values(FEATURE_PRESET_STATES.WEBSITE_AND_EMAIL_ENQUIRIES),
    ).toEqual(expect.arrayContaining(['DISABLED']));
    expect(
      Object.values(FEATURE_PRESET_STATES.WEBSITE_AND_EMAIL_ENQUIRIES).every(
        (state) => state === 'DISABLED',
      ),
    ).toBe(true);
    expect(
      Object.values(FEATURE_PRESET_STATES.FULL_OPERATIONS).every(
        (state) => state === 'ENABLED',
      ),
    ).toBe(true);
  });

  it('keeps the operational dependency graph explicit', () => {
    expect(FEATURE_DEPENDENCIES.RESERVATIONS).toEqual([
      'INVENTORY_TRACKING',
      'QUOTES_AND_ORDERS',
    ]);
    expect(FEATURE_DEPENDENCIES.QUOTES_AND_ORDERS).toContain('RENTAL_REQUESTS');
    expect(FEATURE_DEPENDENCIES.INSPECTIONS).toEqual([
      'MAINTENANCE',
      'INVENTORY_TRACKING',
    ]);
  });

  it('allows Testing publicly only outside production', () => {
    expect(isFeatureAvailable('INTERNAL_TESTING', 'LOCAL', 'PUBLIC')).toBe(
      true,
    );
    expect(isFeatureAvailable('INTERNAL_TESTING', 'STAGING', 'PUBLIC')).toBe(
      true,
    );
    expect(isFeatureAvailable('INTERNAL_TESTING', 'PRODUCTION', 'PUBLIC')).toBe(
      false,
    );
    expect(isFeatureAvailable('INTERNAL_TESTING', 'PRODUCTION', 'ADMIN')).toBe(
      true,
    );
  });

  it('requires bounded validated mutation input', () => {
    expect(
      featureChangeSchema.safeParse({
        expectedVersions: { INVENTORY_TRACKING: 0 },
        featureKey: 'INVENTORY_TRACKING',
        includeDependencies: false,
        includeDependents: true,
        operationId: '6945d270-a0d3-4c7f-9364-4d7e8eae987d',
        reason: 'Initial public website launch.',
        state: 'DISABLED',
      }).success,
    ).toBe(true);
  });
});

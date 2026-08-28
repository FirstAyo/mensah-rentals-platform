import { z } from 'zod';

export const platformFeatureKeys = [
  'RENTAL_REQUESTS',
  'QUOTES_AND_ORDERS',
  'CUSTOMER_ORDER_PORTAL',
  'INVENTORY_TRACKING',
  'RESERVATIONS',
  'FULFILMENT',
  'RETURNS',
  'DAMAGED_RETURN_HANDLING',
  'MAINTENANCE',
  'INSPECTIONS',
  'OPERATIONAL_REPORTING',
] as const;

export const platformFeatureStates = [
  'DISABLED',
  'INTERNAL_TESTING',
  'ENABLED',
] as const;

export const platformFeaturePresets = [
  'WEBSITE_ONLY',
  'WEBSITE_AND_RENTAL_REQUESTS',
  'STAGED_OPERATIONS_TEST',
  'FULL_OPERATIONS',
] as const;

export const platformEnvironmentSchema = z.enum([
  'LOCAL',
  'STAGING',
  'PRODUCTION',
]);
export const platformFeatureKeySchema = z.enum(platformFeatureKeys);
export const platformFeatureStateSchema = z.enum(platformFeatureStates);
export const platformFeaturePresetSchema = z.enum(platformFeaturePresets);

export type PlatformFeatureKey = z.infer<typeof platformFeatureKeySchema>;
export type PlatformFeatureState = z.infer<typeof platformFeatureStateSchema>;
export type PlatformFeaturePreset = z.infer<typeof platformFeaturePresetSchema>;
export type PlatformEnvironment = z.infer<typeof platformEnvironmentSchema>;

export const FEATURE_DEPENDENCIES: Readonly<
  Record<PlatformFeatureKey, readonly PlatformFeatureKey[]>
> = {
  CUSTOMER_ORDER_PORTAL: ['QUOTES_AND_ORDERS'],
  DAMAGED_RETURN_HANDLING: ['RETURNS', 'INVENTORY_TRACKING'],
  FULFILMENT: ['RESERVATIONS', 'INVENTORY_TRACKING', 'QUOTES_AND_ORDERS'],
  INSPECTIONS: ['MAINTENANCE', 'INVENTORY_TRACKING'],
  INVENTORY_TRACKING: [],
  MAINTENANCE: ['INVENTORY_TRACKING'],
  OPERATIONAL_REPORTING: [],
  QUOTES_AND_ORDERS: ['RENTAL_REQUESTS'],
  RENTAL_REQUESTS: [],
  RESERVATIONS: ['INVENTORY_TRACKING', 'QUOTES_AND_ORDERS'],
  RETURNS: ['FULFILMENT'],
};

export const FEATURE_PRESET_STATES: Readonly<
  Record<
    PlatformFeaturePreset,
    Readonly<Record<PlatformFeatureKey, PlatformFeatureState>>
  >
> = {
  FULL_OPERATIONS: Object.fromEntries(
    platformFeatureKeys.map((key) => [key, 'ENABLED']),
  ) as Record<PlatformFeatureKey, PlatformFeatureState>,
  STAGED_OPERATIONS_TEST: Object.fromEntries(
    platformFeatureKeys.map((key) => [key, 'INTERNAL_TESTING']),
  ) as Record<PlatformFeatureKey, PlatformFeatureState>,
  WEBSITE_AND_RENTAL_REQUESTS: Object.fromEntries(
    platformFeatureKeys.map((key) => [
      key,
      key === 'RENTAL_REQUESTS' ? 'ENABLED' : 'DISABLED',
    ]),
  ) as Record<PlatformFeatureKey, PlatformFeatureState>,
  WEBSITE_ONLY: Object.fromEntries(
    platformFeatureKeys.map((key) => [key, 'DISABLED']),
  ) as Record<PlatformFeatureKey, PlatformFeatureState>,
};

const operationIdSchema = z.string().uuid();
const expectedVersionsSchema = z
  .record(platformFeatureKeySchema, z.number().int().min(0))
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one expected version is required.',
  });

export const featureChangePreviewSchema = z
  .object({
    featureKey: platformFeatureKeySchema,
    state: platformFeatureStateSchema,
    includeDependencies: z.boolean().default(false),
    includeDependents: z.boolean().default(false),
  })
  .strict();

export const featureChangeSchema = featureChangePreviewSchema.extend({
  expectedVersions: expectedVersionsSchema,
  operationId: operationIdSchema,
  reason: z.string().trim().min(10).max(500).optional(),
});

export const featurePresetPreviewSchema = z
  .object({ preset: platformFeaturePresetSchema })
  .strict();

export const featurePresetApplySchema = featurePresetPreviewSchema.extend({
  expectedVersions: expectedVersionsSchema,
  operationId: operationIdSchema,
  reason: z.string().trim().min(10).max(500).optional(),
});

export type FeatureChangePreviewInput = z.infer<
  typeof featureChangePreviewSchema
>;
export type FeatureChangeInput = z.infer<typeof featureChangeSchema>;
export type FeaturePresetPreviewInput = z.infer<
  typeof featurePresetPreviewSchema
>;
export type FeaturePresetApplyInput = z.infer<typeof featurePresetApplySchema>;

export function isFeatureAvailable(
  state: PlatformFeatureState,
  environment: PlatformEnvironment,
  audience: 'ADMIN' | 'PUBLIC',
) {
  if (state === 'ENABLED') return true;
  if (state === 'DISABLED') return false;
  return audience === 'ADMIN' || environment !== 'PRODUCTION';
}

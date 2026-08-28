import type { PlatformFeatureKey } from '@mensah-rentals/validation';

export const FEATURE_DETAILS: Record<
  PlatformFeatureKey,
  { label: string; description: string }
> = {
  CUSTOMER_ORDER_PORTAL: {
    label: 'Customer order portal',
    description:
      'Secure customer access to quotes, orders, and fulfilment updates.',
  },
  DAMAGED_RETURN_HANDLING: {
    label: 'Damaged return handling',
    description:
      'Record and resolve missing, damaged, or maintenance-related return issues.',
  },
  FULFILMENT: {
    label: 'Fulfilment',
    description: 'Prepare, hand off, and check out reserved rental equipment.',
  },
  INSPECTIONS: {
    label: 'Inspections',
    description: 'Schedule and complete equipment inspections.',
  },
  INVENTORY_TRACKING: {
    label: 'Inventory tracking',
    description:
      'Track owned bulk and serialized equipment and physical states.',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    description:
      'Manage equipment maintenance work orders and return-to-service work.',
  },
  OPERATIONAL_REPORTING: {
    label: 'Operational reporting',
    description: 'View and export protected operational reports.',
  },
  QUOTES_AND_ORDERS: {
    label: 'Quotes and orders',
    description: 'Prepare custom quotes and create confirmed rental orders.',
  },
  RENTAL_REQUESTS: {
    label: 'Rental requests',
    description:
      'Let customers build a cart and submit equipment rental requests.',
  },
  RESERVATIONS: {
    label: 'Reservations',
    description: 'Reserve approved inventory against confirmed rental orders.',
  },
  RETURNS: {
    label: 'Returns',
    description: 'Receive checked-out equipment and complete active rentals.',
  },
};

export const FEATURE_STATE_RANK = {
  DISABLED: 0,
  INTERNAL_TESTING: 1,
  ENABLED: 2,
} as const;

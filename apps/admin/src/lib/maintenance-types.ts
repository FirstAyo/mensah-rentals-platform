import type {
  AdminEquipmentInspectionResponse,
  AdminEquipmentInspectionSummaryResponse,
  AdminMaintenanceStaffSummary,
  AdminMaintenanceWorkOrderResponse,
  AdminMaintenanceWorkOrderSummaryResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';

export type MaintenanceAssignee = AdminMaintenanceStaffSummary;
export type MaintenanceWorkOrderSummary =
  AdminMaintenanceWorkOrderSummaryResponse;
export type MaintenanceWorkOrderDetail = AdminMaintenanceWorkOrderResponse;
export type EquipmentInspectionSummary =
  AdminEquipmentInspectionSummaryResponse;
export type EquipmentInspectionDetail = AdminEquipmentInspectionResponse;
export type MaintenancePagination<T> = PaginatedResponse<T>;

export interface MaintenanceSourceOption {
  assetNumber: string;
  inventoryItemId: string;
  quantityAvailable: number;
  serialNumber: string | null;
}

export interface MaintenanceSourceTarget {
  assetNumber?: string | null;
  eligible: boolean;
  inventoryId: string;
  inventoryItemId?: string | null;
  productName: string;
  quantityAvailable?: number;
  serialNumber?: string | null;
  targets?: MaintenanceSourceOption[];
}

export function maintenanceSourceOptions(
  source: MaintenanceSourceTarget | null,
): MaintenanceSourceOption[] {
  if (!source) return [];
  if (source.targets?.length) return source.targets;
  if (!source.inventoryItemId) return [];
  return [
    {
      assetNumber: source.assetNumber ?? 'Serialized asset',
      inventoryItemId: source.inventoryItemId,
      quantityAvailable: 1,
      serialNumber: source.serialNumber ?? null,
    },
  ];
}

export function maintenanceSourceQuantity(
  source: MaintenanceSourceTarget,
): number {
  return source.targets?.length ? 1 : (source.quantityAvailable ?? 1);
}

export function humanizeMaintenance(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function maintenanceDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not scheduled';
}

export function maintenanceStaffItems(value: unknown): MaintenanceAssignee[] {
  if (Array.isArray(value)) return value as MaintenanceAssignee[];
  if (
    value &&
    typeof value === 'object' &&
    'items' in value &&
    Array.isArray(value.items)
  )
    return value.items as MaintenanceAssignee[];
  return [];
}

export const REPORTING_METRIC_DEFINITIONS = {
  inspectionsScheduled: {
    basis: 'EquipmentInspection.createdAt',
    description:
      'Inspections created during the selected period, regardless of their later lifecycle state.',
    kind: 'IMMUTABLE_PERIOD_EVENT',
  },
  ordersPrepared: {
    basis: 'OrderFulfilment.readyAt',
    description: 'Fulfilments that reached READY during the selected period.',
    kind: 'IMMUTABLE_PERIOD_EVENT',
  },
  partialCheckouts: {
    basis:
      'FulfilmentOperation(CHECKOUT) cumulative checkedOutDelta < immutable ordered quantity',
    description:
      'Immutable checkout events that left part of the commercial equipment list outstanding.',
    kind: 'IMMUTABLE_PERIOD_EVENT',
  },
  partialReturns: {
    basis:
      'RentalReturnOperation cumulative quantityReceived < immutable expected checked-out quantity',
    description:
      'Immutable return-intake events that left checked-out equipment outstanding.',
    kind: 'IMMUTABLE_PERIOD_EVENT',
  },
  reconciliationCurrent: {
    basis: 'RentalReturn.status = RECONCILIATION_REQUIRED',
    description: 'Current snapshot; not limited to the selected period.',
    kind: 'CURRENT_SNAPSHOT',
  },
} as const;

export function projectInstantToBusinessDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

import { UnprocessableEntityException } from '@nestjs/common';

import type { ReportOverviewQuery } from './reporting.schemas';

export interface ResolvedReportRange {
  endDate: string;
  endExclusiveUtc: Date;
  startDate: string;
  startUtc: Date;
  timeZone: string;
}

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: get('day'), month: get('month'), year: get('year') };
}

function iso({ day, month, year }: ReturnType<typeof dateParts>) {
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function shift(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localMidnightUtc(date: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let candidate = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const displayed = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') === 24 ? 0 : get('hour'),
      get('minute'),
      get('second'),
    );
    const target = Date.UTC(year, month - 1, day);
    const corrected = candidate + (target - displayed);
    if (corrected === candidate) return new Date(candidate);
    candidate = corrected;
  }
  return new Date(candidate);
}

export function resolveReportRange(
  query: Pick<ReportOverviewQuery, 'preset' | 'startDate' | 'endDate'>,
  timeZone: string,
  maxDays: number,
  now = new Date(),
): ResolvedReportRange {
  const today = iso(dateParts(now, timeZone));
  let startDate = today;
  let endDate = today;
  if (query.preset === 'CUSTOM') {
    startDate = query.startDate!;
    endDate = query.endDate!;
  } else if (query.preset === 'LAST_7_DAYS') startDate = shift(today, -6);
  else if (query.preset === 'LAST_30_DAYS') startDate = shift(today, -29);
  else if (query.preset === 'THIS_MONTH') startDate = `${today.slice(0, 7)}-01`;
  else if (query.preset === 'PREVIOUS_MONTH') {
    const firstThisMonth = `${today.slice(0, 7)}-01`;
    endDate = shift(firstThisMonth, -1);
    startDate = `${endDate.slice(0, 7)}-01`;
  } else if (query.preset === 'THIS_YEAR')
    startDate = `${today.slice(0, 4)}-01-01`;

  const startUtc = localMidnightUtc(startDate, timeZone);
  const endExclusiveUtc = localMidnightUtc(shift(endDate, 1), timeZone);
  const days =
    Math.round(
      (new Date(`${endDate}T00:00:00.000Z`).getTime() -
        new Date(`${startDate}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1;
  if (days < 1 || days > maxDays)
    throw new UnprocessableEntityException({
      error: 'Unprocessable Entity',
      message: `Report ranges must be between 1 and ${maxDays} days.`,
      statusCode: 422,
    });
  return { endDate, endExclusiveUtc, startDate, startUtc, timeZone };
}

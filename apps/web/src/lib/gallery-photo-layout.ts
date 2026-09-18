export const GALLERY_PAGE_SIZE = 12;
export const GALLERY_MOBILE_ROW_COUNT = 3;
export const GALLERY_MOBILE_AUTOPLAY_MINIMUM = 9;
export const GALLERY_TABLET_BATCH_SIZE = 9;
export const GALLERY_WIDE_BATCH_SIZE = 12;

export function distributeGalleryRows<T>(
  items: readonly T[],
  rowCount = GALLERY_MOBILE_ROW_COUNT,
): T[][] {
  if (!Number.isInteger(rowCount) || rowCount < 1) return [];
  const rows = Array.from({ length: rowCount }, () => [] as T[]);
  items.forEach((item, index) => rows[index % rowCount]!.push(item));
  return rows;
}

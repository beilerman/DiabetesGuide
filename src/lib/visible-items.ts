export const DEFAULT_VISIBLE_ITEMS = 48

export function getVisibleItems<T>(items: T[], visibleCount: number): T[] {
  return items.slice(0, Math.max(0, visibleCount))
}

export function getNextVisibleCount(
  currentVisibleCount: number,
  totalCount: number,
  pageSize = DEFAULT_VISIBLE_ITEMS,
): number {
  return Math.min(totalCount, Math.max(0, currentVisibleCount) + pageSize)
}

export function hasMoreVisibleItems(totalCount: number, visibleCount: number): boolean {
  return totalCount > visibleCount
}

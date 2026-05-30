/**
 * Single source of truth for every localStorage key the app writes.
 *
 * Why this exists: the Settings "Clear all app data" action must wipe ALL
 * persisted state on a no-auth health app where localStorage IS the database.
 * Previously the clear-list was a hand-maintained array in Settings.tsx that
 * had already drifted (it omitted the estimator-acknowledgment and menu-count
 * cache keys), so "clear my data" silently left data behind.
 *
 * `LOCAL_APP_STORAGE_KEYS` is derived from `STORAGE_KEYS` via `Object.values`,
 * so adding a key here automatically includes it in the clear-list — it can't
 * drift again. Every module that persists state should import its key from here
 * rather than re-declaring a string literal.
 */
export const STORAGE_KEYS = {
  mealCart: 'dg_meal_cart',
  favorites: 'dg_favorites',
  compare: 'dg_compare',
  /** Current versioned trip-plan key. */
  tripPlan: 'dg.trips.v1',
  /** Pre-v1 trip-plan key, still cleared so old installs are fully wiped. */
  tripPlanLegacy: 'dg_trip_plan',
  preferences: 'dg_preferences',
  recentSearches: 'dg_recent_searches',
  insulinSettings: 'dg_insulin_settings',
  checklist: 'dg_checklist',
  checklistOptions: 'dg_checklist_options',
  estimatorAck: 'dg_estimator_acknowledged_v1',
  menuItemCounts: 'dg_menu_item_counts_by_park_v1',
} as const

export type StorageKeyName = keyof typeof STORAGE_KEYS

/**
 * The complete set of app localStorage keys, for bulk operations like
 * "clear all app data". Derived from STORAGE_KEYS so it stays exhaustive.
 */
export const LOCAL_APP_STORAGE_KEYS: readonly string[] = Object.values(STORAGE_KEYS)

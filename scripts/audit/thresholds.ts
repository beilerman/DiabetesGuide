export const THRESHOLDS = {
  // Accuracy
  MAX_CALORIES: 5000,
  MAX_SODIUM: 10000,
  ATWATER_HIGH_PCT: 50,
  ATWATER_MEDIUM_PCT: 20,
  ATWATER_MIN_ABS_CAL: 50,
  ATWATER_MIN_ABS_MEDIUM_CAL: 30,
  ATWATER_MEDIUM_PCT_BEVERAGE: 30,
  TEMPLATE_MIN_COUNT: 5,

  // Completeness
  MIN_RESTAURANTS_PER_PARK: 10, // legacy flat threshold (kept for backward compat)
  MIN_RESTAURANTS_BY_PARK_TYPE: {
    'theme-park': 10,
    'district': 10,
    'cruise-ship': 5,
    'water-park': 2,
    'resort': 1,
    'other': 1,
  } as Record<string, number>,
  MIN_ITEMS_PER_RESTAURANT: 3,
  MAX_NULL_CALORIE_PCT: 30,
  MIN_CONFIDENCE_SCORE: 30,

  // External
  CHAIN_DRIFT_PCT: 20,
  STALE_DATA_DAYS: 90,
  STALE_CONFIDENCE_MAX: 50,

  // Graduation
  GRADUATION_THRESHOLD: 14,

  // Auto-fix
  FIBER_CARB_RATIO: 0.10,
  SODIUM_DIVISOR: 10,
} as const

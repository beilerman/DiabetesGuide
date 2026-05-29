/**
 * Common join shapes for Supabase REST select() responses.
 *
 * Background: PostgREST returns nested rows as either a single object OR a
 * single-element array depending on the join cardinality at the API layer.
 * Every script that selects `restaurants(...)` from `menu_items`, or
 * `parks(...)` from `restaurants`, runs into the same `Array<T> | T | null`
 * dance. Centralising the types here keeps every script in lock-step with
 * the schema; renaming `parks.name` flows through one file instead of N.
 *
 * Keep these field lists narrow — only what scripts actually consume. Scripts
 * that need more columns should extend a local interface rather than widening
 * the shared ones.
 */

export interface ParkRef {
  name: string | null
}

export interface RestaurantRef {
  id?: string
  name: string | null
}

export interface RestaurantWithPark extends RestaurantRef {
  park: ParkRef | ParkRef[] | null
}

/**
 * Flatten Supabase's `T | T[] | null` join result to `T | null`. PostgREST
 * returns a single-element array for many-to-one joins, but the JS types are
 * `T | T[]` because the same select() can also produce an array.
 */
export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

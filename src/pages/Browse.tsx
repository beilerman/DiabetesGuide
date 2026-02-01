import { useState, useMemo } from 'react'
import { useMenuItems, useParks } from '../lib/queries'
import { FilterBar } from '../components/filters/FilterBar'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import type { Filters, MenuItemWithNutrition } from '../lib/types'

const defaultFilters: Filters = {
  search: '', maxCarbs: null, category: null,
  vegetarianOnly: false, hideFried: false, hideDrinks: false, sort: 'name',
}

function applyFilters(items: MenuItemWithNutrition[], filters: Filters): MenuItemWithNutrition[] {
  let result = items

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.description?.toLowerCase().includes(q)) ||
      (i.restaurant?.name.toLowerCase().includes(q))
    )
  }
  if (filters.maxCarbs != null) {
    result = result.filter(i => (i.nutritional_data?.[0]?.carbs ?? 0) <= filters.maxCarbs!)
  }
  if (filters.category) {
    result = result.filter(i => i.category === filters.category)
  }
  if (filters.vegetarianOnly) result = result.filter(i => i.is_vegetarian)
  if (filters.hideFried) result = result.filter(i => !i.is_fried)
  if (filters.hideDrinks) result = result.filter(i => i.category !== 'beverage')

  const sortFns: Record<string, (a: MenuItemWithNutrition, b: MenuItemWithNutrition) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    carbsAsc: (a, b) => (a.nutritional_data?.[0]?.carbs ?? 0) - (b.nutritional_data?.[0]?.carbs ?? 0),
    carbsDesc: (a, b) => (b.nutritional_data?.[0]?.carbs ?? 0) - (a.nutritional_data?.[0]?.carbs ?? 0),
    caloriesAsc: (a, b) => (a.nutritional_data?.[0]?.calories ?? 0) - (b.nutritional_data?.[0]?.calories ?? 0),
    caloriesDesc: (a, b) => (b.nutritional_data?.[0]?.calories ?? 0) - (a.nutritional_data?.[0]?.calories ?? 0),
  }
  result = [...result].sort(sortFns[filters.sort] || sortFns.name)

  return result
}

export default function Browse() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [parkId, setParkId] = useState<string | undefined>()
  const { data: parks } = useParks()
  const { data: items, isLoading } = useMenuItems(parkId)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()

  const filtered = useMemo(() => applyFilters(items ?? [], filters), [items, filters])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Browse Menu</h1>
      <div className="mb-4">
        <select
          value={parkId ?? ''}
          onChange={e => setParkId(e.target.value || undefined)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All Parks</option>
          {parks?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      {isLoading ? (
        <p className="mt-4">Loading...</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onAddToMeal={addItem}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggle}
            />
          ))}
          {filtered.length === 0 && <p className="text-gray-500">No items match your filters.</p>}
        </div>
      )}
    </div>
  )
}

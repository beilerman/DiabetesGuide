import type { Filters } from '../../lib/types'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FilterBar({ filters, onChange }: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
      <input
        type="text"
        placeholder="Search..."
        value={filters.search}
        onChange={e => set('search', e.target.value)}
        className="rounded-lg border px-3 py-1.5 text-sm"
      />
      <label className="flex items-center gap-1 text-sm">
        Max carbs:
        <input
          type="number"
          value={filters.maxCarbs ?? ''}
          onChange={e => set('maxCarbs', e.target.value ? Number(e.target.value) : null)}
          className="w-16 rounded border px-2 py-1"
          placeholder="Any"
        />
      </label>
      <select
        value={filters.category ?? ''}
        onChange={e => set('category', (e.target.value || null) as any)}
        className="rounded-lg border px-2 py-1.5 text-sm"
      >
        <option value="">All categories</option>
        <option value="entree">Entree</option>
        <option value="snack">Snack</option>
        <option value="beverage">Beverage</option>
        <option value="dessert">Dessert</option>
        <option value="side">Side</option>
      </select>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={filters.vegetarianOnly} onChange={e => set('vegetarianOnly', e.target.checked)} />
        Vegetarian
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={filters.hideFried} onChange={e => set('hideFried', e.target.checked)} />
        Hide fried
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={filters.hideDrinks} onChange={e => set('hideDrinks', e.target.checked)} />
        Hide drinks
      </label>
      <select
        value={filters.sort}
        onChange={e => set('sort', e.target.value as Filters['sort'])}
        className="rounded-lg border px-2 py-1.5 text-sm"
      >
        <option value="name">Sort: Name</option>
        <option value="carbsAsc">Carbs (low to high)</option>
        <option value="carbsDesc">Carbs (high to low)</option>
        <option value="caloriesAsc">Calories (low to high)</option>
        <option value="caloriesDesc">Calories (high to low)</option>
      </select>
    </div>
  )
}

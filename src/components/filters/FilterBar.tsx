import type { Filters } from '../../lib/types'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FilterBar({ filters, onChange }: Props) {

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value })

  const activeFilterCount = [
    filters.search,
    filters.maxCarbs != null,
    filters.category != null,
    filters.vegetarianOnly,
    filters.hideFried,
    filters.hideDrinks,
  ].filter(Boolean).length

  const clearAllFilters = () => {
    onChange({
      search: '',
      maxCarbs: null,
      category: null,
      vegetarianOnly: false,
      hideFried: false,
      hideDrinks: false,
      sort: filters.sort,
    })
  }

  const categories: Array<{ value: string; label: string; icon: string }> = [
    { value: 'entree', label: 'Entree', icon: '🍽️' },
    { value: 'snack', label: 'Snack', icon: '🥨' },
    { value: 'beverage', label: 'Beverage', icon: '🥤' },
    { value: 'dessert', label: 'Dessert', icon: '🍰' },
    { value: 'side', label: 'Side', icon: '🥗' },
  ]

  return (
    <div className="sticky top-0 z-40 bg-stone-50/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
      <div className="p-4 space-y-3">
        {/* Search input - full width on mobile */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search menu items, restaurants..."
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-stone-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none text-sm transition-colors"
          />
        </div>

        {/* Quick filter chips - always visible */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => set('maxCarbs', filters.maxCarbs === 30 ? null : 30)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              filters.maxCarbs === 30
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            Low Carb (&lt;30g)
          </button>
          <button
            onClick={() => set('vegetarianOnly', !filters.vegetarianOnly)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              filters.vegetarianOnly
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            🌱 Vegetarian
          </button>
          <button
            onClick={() => set('hideFried', !filters.hideFried)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              filters.hideFried
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            No Fried
          </button>
        </div>

        {/* Category pills - horizontal scrollable */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Category:</span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => set('category', null)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                filters.category === null
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-stone-200 hover:border-teal-300'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.value}
                onClick={() => set('category', cat.value as any)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  filters.category === cat.value
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-stone-200 hover:border-teal-300'
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Max carbs slider and sort dropdown */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Max Carbs: {filters.maxCarbs ?? 'Any'}{filters.maxCarbs != null ? 'g' : ''}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="150"
                step="5"
                value={filters.maxCarbs ?? 150}
                onChange={e => {
                  const value = Number(e.target.value)
                  set('maxCarbs', value === 150 ? null : value)
                }}
                className="flex-1 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer slider-thumb:bg-teal-600"
                style={{
                  background: `linear-gradient(to right, #0d9488 0%, #0d9488 ${((filters.maxCarbs ?? 150) / 150) * 100}%, #e7e5e4 ${((filters.maxCarbs ?? 150) / 150) * 100}%, #e7e5e4 100%)`
                }}
              />
              <span className="text-sm font-semibold text-gray-700 min-w-[3rem] text-right">
                {filters.maxCarbs ?? 150}g
              </span>
            </div>
          </div>

          <div className="relative">
            <select
              value={filters.sort}
              onChange={e => set('sort', e.target.value as Filters['sort'])}
              className="appearance-none px-4 py-2 pr-10 rounded-xl border-2 border-stone-200 bg-white text-sm font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none cursor-pointer"
            >
              <option value="name">Name A-Z</option>
              <option value="carbsAsc">Carbs ↑</option>
              <option value="carbsDesc">Carbs ↓</option>
              <option value="caloriesAsc">Calories ↑</option>
              <option value="caloriesDesc">Calories ↓</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Clear filters button - shown when filters are active */}
        {activeFilterCount > 0 && (
          <div className="flex justify-between items-center pt-2 border-t border-stone-200">
            <span className="text-xs text-gray-600">
              {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
            </span>
            <button
              onClick={clearAllFilters}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

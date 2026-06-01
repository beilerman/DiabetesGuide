import { useState } from 'react'
import type { Filters, MenuItem } from '../../lib/types'
import type { Grade } from '../../lib/grade'
import { GRADE_CONFIG } from '../../lib/grade'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
}

const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'F']

// The slider's top stop means "no carb limit". One constant so the value, the
// thumb, the gradient, the label, and the aria text can never drift apart.
const MAX_CARB_CAP = 150

const ALLERGEN_TOGGLES = [
  { key: 'milk', label: 'Dairy-Free' },
  { key: 'wheat', label: 'Gluten-Free' },
  { key: 'peanuts', label: 'Peanut-Free' },
  { key: 'tree_nuts', label: 'Nut-Free' },
]

export function FilterBar({ filters, onChange }: Props) {
  // On mobile the full filter stack pushes all results below the fold, so the
  // advanced filters collapse behind a toggle. They are always shown on md+.
  const [expanded, setExpanded] = useState(false)

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value })

  // Free-text search is a separate affordance from the structured filters, so it
  // is intentionally excluded from this count — typing in search must not
  // increment the "filters active" badge.
  const activeFilterCount = [
    filters.maxCarbs != null,
    filters.category != null,
    filters.vegetarianOnly,
    filters.hideFried,
    filters.hideDrinks,
    filters.hideAlcohol,
    filters.gradeFilter && filters.gradeFilter.length > 0,
    filters.allergenFree.length > 0,
  ].filter(Boolean).length

  const clearAllFilters = () => {
    onChange({
      search: '',
      maxCarbs: null,
      category: null,
      vegetarianOnly: false,
      hideFried: false,
      hideDrinks: false,
      hideAlcohol: false,
      gradeFilter: null,
      allergenFree: [],
      sort: filters.sort,
    })
  }

  const toggleGrade = (grade: Grade) => {
    const current = filters.gradeFilter ?? []
    const next = current.includes(grade)
      ? current.filter(g => g !== grade)
      : [...current, grade]
    set('gradeFilter', next.length > 0 ? next : null)
  }

  const toggleAllergen = (allergen: string) => {
    const current = filters.allergenFree
    const next = current.includes(allergen)
      ? current.filter(a => a !== allergen)
      : [...current, allergen]
    set('allergenFree', next)
  }

  const categories: Array<{ value: MenuItem['category']; label: string }> = [
    { value: 'entree', label: 'Entree' },
    { value: 'snack', label: 'Snack' },
    { value: 'beverage', label: 'Beverage' },
    { value: 'dessert', label: 'Dessert' },
    { value: 'side', label: 'Side' },
  ]

  return (
    <div className="bg-stone-50/95 border-b border-stone-200 shadow-sm">
      <div className="p-4 space-y-3">
        {/* Search input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="browse-filter-search"
            type="text"
            placeholder="Search menu items, restaurants..."
            aria-label="Search menu items and restaurants"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border-2 border-stone-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none text-sm transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => set('search', '')}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Grade pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-600 whitespace-nowrap">Grade:</span>
          <div className="flex gap-1.5">
            {GRADES.map(grade => {
              const active = filters.gradeFilter?.includes(grade) ?? false
              const colors = GRADE_CONFIG[grade]
              return (
                <button
                  key={grade}
                  onClick={() => toggleGrade(grade)}
                  className={`w-10 h-10 rounded-full text-sm font-bold transition-all duration-200 ${
                    active
                      ? 'text-white shadow-md scale-105'
                      : 'bg-white border border-stone-200 text-stone-500 hover:border-stone-300'
                  }`}
                  style={active ? { backgroundColor: colors.bg } : undefined}
                  aria-label={`Filter by grade ${grade}`}
                  aria-pressed={active}
                >
                  {grade}
                </button>
              )
            })}
          </div>
        </div>

        {/* Mobile-only toggle for the advanced filter stack */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-controls="advanced-filters"
          className="md:hidden flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700"
        >
          <span className="flex items-center gap-2">
            {expanded ? 'Fewer filters' : 'More filters'}
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <svg className={`h-4 w-4 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Advanced filters: collapsible on mobile, always shown on md+ */}
        <div id="advanced-filters" className={`${expanded ? 'block' : 'hidden'} md:block space-y-3`}>
        {/* Quick filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => set('maxCarbs', filters.maxCarbs === 30 ? null : 30)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              filters.maxCarbs === 30
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-stone-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            Low Carb (&lt;30g)
          </button>
          <button
            onClick={() => set('vegetarianOnly', !filters.vegetarianOnly)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              filters.vegetarianOnly
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-stone-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            Vegetarian
          </button>
          <button
            onClick={() => set('hideFried', !filters.hideFried)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              filters.hideFried
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-stone-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            No Fried
          </button>
          <button
            onClick={() => set('hideAlcohol', !filters.hideAlcohol)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              filters.hideAlcohol
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-stone-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            No Alcohol
          </button>
        </div>

        {/* Allergen-free toggles */}
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_TOGGLES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleAllergen(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                filters.allergenFree.includes(key)
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-white text-stone-700 border border-stone-200 hover:border-amber-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-600 whitespace-nowrap">Category:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => set('category', null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                filters.category === null
                  ? 'bg-teal-700 text-white shadow-md'
                  : 'bg-white text-stone-700 border border-stone-200 hover:border-teal-300'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.value}
                onClick={() => set('category', cat.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                  filters.category === cat.value
                    ? 'bg-teal-700 text-white shadow-md'
                    : 'bg-white text-stone-700 border border-stone-200 hover:border-teal-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Max carbs slider and sort */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Max Carbs: {filters.maxCarbs == null ? `Any (${MAX_CARB_CAP}g+)` : `${filters.maxCarbs}g`}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={MAX_CARB_CAP}
                step={5}
                value={filters.maxCarbs ?? MAX_CARB_CAP}
                onChange={e => {
                  const value = Number(e.target.value)
                  set('maxCarbs', value === MAX_CARB_CAP ? null : value)
                }}
                aria-label="Maximum carbs filter"
                aria-valuemin={0}
                aria-valuemax={MAX_CARB_CAP}
                aria-valuenow={filters.maxCarbs ?? MAX_CARB_CAP}
                aria-valuetext={filters.maxCarbs == null ? 'Any — no carb limit' : `${filters.maxCarbs} grams`}
                className="flex-1 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #0f766e 0%, #0f766e ${((filters.maxCarbs ?? MAX_CARB_CAP) / MAX_CARB_CAP) * 100}%, #e7e5e4 ${((filters.maxCarbs ?? MAX_CARB_CAP) / MAX_CARB_CAP) * 100}%, #e7e5e4 100%)`
                }}
              />
              <span className="text-xs font-semibold text-stone-700 min-w-[3rem] text-right">
                {filters.maxCarbs == null ? 'Any' : `${filters.maxCarbs}g`}
              </span>
            </div>
          </div>

          <div className="relative">
            <select
              aria-label="Sort menu items"
              value={filters.sort}
              onChange={e => set('sort', e.target.value as Filters['sort'])}
              className="appearance-none px-3 py-1.5 pr-8 rounded-lg border border-stone-200 bg-white text-xs font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none cursor-pointer"
            >
              <option value="name">Name A-Z</option>
              <option value="grade">Grade</option>
              <option value="carbsAsc">Carbs ↑</option>
              <option value="carbsDesc">Carbs ↓</option>
              <option value="caloriesAsc">Calories ↑</option>
              <option value="caloriesDesc">Calories ↓</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <svg className="h-3 w-3 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active filter count + clear */}
        {activeFilterCount > 0 && (
          <div className="flex justify-between items-center pt-2 border-t border-stone-200">
            <span className="text-xs text-stone-600">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-teal-700 text-white text-[10px] font-bold rounded-full mr-1">
                {activeFilterCount}
              </span>
              filter{activeFilterCount !== 1 ? 's' : ''} active
            </span>
            <button
              onClick={clearAllFilters}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

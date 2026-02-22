import { useState, useMemo } from 'react'
import { useMenuItems, useParks } from '../lib/queries'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { GradeBadge } from '../components/menu/GradeBadge'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { useCompare } from '../hooks/useCompare'
import { useTripPlan } from '../hooks/useTripPlan'
import type { DayTotals } from '../hooks/useTripPlan'
import { computeScore, computeGrade } from '../lib/grade'
import { RESORT_CONFIG, getParksForResort } from '../lib/resort-config'
// Lazy-load PDF export to keep main bundle small (~200KB for jsPDF)
const lazyExportPdf = () => import('../lib/export-pdf').then(m => m.exportTripPlanPdf)
import type { MealItem } from '../lib/types'

type SortOption = 'recent' | 'grade' | 'carbsAsc' | 'carbsDesc'
type Tab = 'favorites' | 'trip'

export default function Plan() {
  const [tab, setTab] = useState<Tab>('favorites')

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
        <TabButton active={tab === 'favorites'} onClick={() => setTab('favorites')}>
          Favorites
        </TabButton>
        <TabButton active={tab === 'trip'} onClick={() => setTab('trip')}>
          Trip Plan
        </TabButton>
      </div>

      {tab === 'favorites' ? <FavoritesTab /> : <TripPlanTab />}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Favorites Tab ───────────────────────────────────────────────────────────

function FavoritesTab() {
  const { data: items, isLoading } = useMenuItems()
  const { addItem } = useMealCart()
  const { favorites, isFavorite, toggle } = useFavorites()
  const { addToCompare } = useCompare()
  const { hasPlan, plan, addItemToSlot } = useTripPlan()
  const [sort, setSort] = useState<SortOption>('recent')
  const [addToDayModal, setAddToDayModal] = useState(false)

  const favoriteItems = useMemo(() => {
    if (!items) return []
    let filtered = items.filter(item => favorites.has(item.id))

    switch (sort) {
      case 'grade':
        filtered = [...filtered].sort((a, b) => {
          const na = a.nutritional_data?.[0]
          const nb = b.nutritional_data?.[0]
          const sa = computeScore({ calories: na?.calories ?? null, carbs: na?.carbs ?? null, fat: na?.fat ?? null, protein: na?.protein ?? null, sugar: na?.sugar ?? null, fiber: na?.fiber ?? null, sodium: na?.sodium ?? null })
          const sb = computeScore({ calories: nb?.calories ?? null, carbs: nb?.carbs ?? null, fat: nb?.fat ?? null, protein: nb?.protein ?? null, sugar: nb?.sugar ?? null, fiber: nb?.fiber ?? null, sodium: nb?.sodium ?? null })
          return (sb ?? -1) - (sa ?? -1)
        })
        break
      case 'carbsAsc':
        filtered = [...filtered].sort((a, b) => (a.nutritional_data?.[0]?.carbs ?? 999) - (b.nutritional_data?.[0]?.carbs ?? 999))
        break
      case 'carbsDesc':
        filtered = [...filtered].sort((a, b) => (b.nutritional_data?.[0]?.carbs ?? 0) - (a.nutritional_data?.[0]?.carbs ?? 0))
        break
      // 'recent' keeps default order
    }

    return filtered
  }, [items, favorites, sort])

  const handleAddAllToDay = (dayIndex: number) => {
    if (!plan) return
    for (const item of favoriteItems) {
      const nd = item.nutritional_data?.[0]
      const mealItem: MealItem = {
        id: item.id,
        name: item.name,
        carbs: nd?.carbs ?? 0,
        calories: nd?.calories ?? 0,
        fat: nd?.fat ?? 0,
        protein: nd?.protein ?? 0,
        sugar: nd?.sugar ?? 0,
        fiber: nd?.fiber ?? 0,
        sodium: nd?.sodium ?? 0,
        restaurant: item.restaurant?.name,
        parkName: item.restaurant?.park?.name,
      }
      // Add to the first meal slot of the day (Breakfast or Meal 1)
      addItemToSlot(dayIndex, 0, mealItem)
    }
    setAddToDayModal(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Favorites</h1>
          <p className="text-sm text-stone-500">{favoriteItems.length} saved {favoriteItems.length === 1 ? 'item' : 'items'}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPlan && favoriteItems.length > 0 && (
            <button
              onClick={() => setAddToDayModal(true)}
              className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700"
            >
              Add all to trip
            </button>
          )}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            className="text-sm rounded-lg border border-stone-300 px-2 py-1.5"
            aria-label="Sort favorites"
          >
            <option value="recent">Recent</option>
            <option value="grade">Best Grade</option>
            <option value="carbsAsc">Carbs: Low to High</option>
            <option value="carbsDesc">Carbs: High to Low</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-md overflow-hidden animate-pulse">
              <div className="p-4 space-y-3">
                <div className="h-5 bg-stone-200 rounded w-3/4" />
                <div className="h-4 bg-stone-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : favoriteItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favoriteItems.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onAddToMeal={addItem}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggle}
              onCompare={addToCompare}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">&#x2764;&#xFE0F;</div>
          <h3 className="text-xl font-semibold text-stone-800 mb-2">No favorites yet</h3>
          <p className="text-stone-600">Tap the heart on any menu item to save it here.</p>
        </div>
      )}

      {/* Add all to day modal */}
      {addToDayModal && plan && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) setAddToDayModal(false) }}
        >
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-lg mb-4">Add favorites to which day?</h3>
            <div className="space-y-2">
              {plan.days.map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleAddAllToDay(i)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-stone-50 hover:bg-teal-50 hover:border-teal-200 border border-stone-200 text-sm font-medium transition-colors"
                >
                  Day {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAddToDayModal(false)}
              className="mt-4 w-full text-sm text-stone-500 hover:text-stone-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Trip Plan Tab ───────────────────────────────────────────────────────────

function TripPlanTab() {
  const { plan, hasPlan, dayTotals, tripTotals, createPlan, assignPark, addItemToSlot, removeItemFromSlot, clearPlan, addDay, removeDay, updateCarbGoal } = useTripPlan()
  const { data: parks } = useParks()

  if (!hasPlan || !plan) {
    return <TripSetupForm onCreatePlan={createPlan} />
  }

  const resort = RESORT_CONFIG.find(r => r.id === plan.resortId)
  const resortParks = parks ? (resort ? getParksForResort(parks, resort) : parks) : []

  return (
    <div className="space-y-6">
      {/* Trip header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {resort?.icon} {resort?.name ?? 'Trip Plan'}
          </h1>
          <p className="text-sm text-stone-500">
            {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'} &middot; {tripTotals.itemCount} items planned
          </p>
        </div>
        <div className="flex gap-2">
          {tripTotals.itemCount > 0 && (
            <button
              onClick={async () => {
                const exportFn = await lazyExportPdf()
                const parkNameMap: Record<string, string> = {}
                for (const p of resortParks) parkNameMap[p.id] = p.name
                exportFn(plan, parkNameMap, resort?.name ?? 'Trip Plan')
              }}
              className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700"
            >
              Export PDF
            </button>
          )}
          <button
            onClick={addDay}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-xs font-medium hover:bg-stone-300"
          >
            + Day
          </button>
          <button
            onClick={clearPlan}
            className="px-3 py-1.5 rounded-lg text-red-600 text-xs font-medium hover:bg-red-50"
          >
            Clear Plan
          </button>
        </div>
      </div>

      {/* Carb goal setting */}
      <div className="flex items-center gap-3 text-sm">
        <label className="text-stone-600">Carb goal per meal:</label>
        <input
          type="number"
          value={plan.carbGoalPerMeal}
          onChange={e => updateCarbGoal(Number(e.target.value) || 60)}
          className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-sm text-center"
          min={0}
        />
        <span className="text-stone-400">g</span>
      </div>

      {/* Day cards */}
      {plan.days.map((day, dayIndex) => (
        <DayCard
          key={dayIndex}
          day={day}
          dayIndex={dayIndex}
          dayTotals={dayTotals[dayIndex]}
          carbGoalPerMeal={plan.carbGoalPerMeal}
          resortParks={resortParks}
          canRemove={plan.days.length > 1}
          onAssignPark={parkId => assignPark(dayIndex, parkId)}
          onAddItem={(mealIndex, item) => addItemToSlot(dayIndex, mealIndex, item)}
          onRemoveItem={(mealIndex, itemIndex) => removeItemFromSlot(dayIndex, mealIndex, itemIndex)}
          onRemoveDay={() => removeDay(dayIndex)}
        />
      ))}

      {/* Trip Summary */}
      {tripTotals.itemCount > 0 && (
        <div className="rounded-xl bg-white border border-stone-200 p-4 shadow-sm">
          <h3 className="font-bold text-stone-900 mb-3">Trip Summary</h3>
          <div className="grid grid-cols-3 gap-3">
            <SummaryBox label="Total Carbs" value={`${tripTotals.carbs}g`} />
            <SummaryBox label="Total Calories" value={`${tripTotals.calories}`} />
            <SummaryBox label="Total Items" value={`${tripTotals.itemCount}`} />
            <SummaryBox label="Avg Carbs/Day" value={`${Math.round(tripTotals.carbs / plan.days.length)}g`} />
            <SummaryBox label="Avg Calories/Day" value={`${Math.round(tripTotals.calories / plan.days.length)}`} />
            <SummaryBox label="Avg Protein/Day" value={`${Math.round(tripTotals.protein / plan.days.length)}g`} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Trip Setup Form ────────────────────────────────────────────────────────

function TripSetupForm({ onCreatePlan }: { onCreatePlan: (resortId: string, numDays: number, mealsPerDay?: number, carbGoalPerMeal?: number) => void }) {
  const [resortId, setResortId] = useState(RESORT_CONFIG[0].id)
  const [numDays, setNumDays] = useState(3)
  const [mealsPerDay, setMealsPerDay] = useState(3)
  const [carbGoal, setCarbGoal] = useState(60)

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center py-4">
        <div className="text-5xl mb-3">&#x1F5D3;&#xFE0F;</div>
        <h2 className="text-2xl font-bold text-stone-900">Plan Your Trip</h2>
        <p className="text-sm text-stone-500 mt-1">Build a day-by-day meal plan with carb tracking</p>
      </div>

      <div className="rounded-xl bg-white border border-stone-200 p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Resort</label>
          <select
            value={resortId}
            onChange={e => setResortId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            {RESORT_CONFIG.map(r => (
              <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Days</label>
            <input
              type="number"
              value={numDays}
              onChange={e => setNumDays(Math.max(1, Math.min(14, Number(e.target.value))))}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-center"
              min={1}
              max={14}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Meals/Day</label>
            <input
              type="number"
              value={mealsPerDay}
              onChange={e => setMealsPerDay(Math.max(1, Math.min(6, Number(e.target.value))))}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-center"
              min={1}
              max={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Carb Goal</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={carbGoal}
                onChange={e => setCarbGoal(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-center"
                min={0}
              />
              <span className="text-xs text-stone-400">g</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onCreatePlan(resortId, numDays, mealsPerDay, carbGoal)}
          className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
        >
          Create Trip Plan
        </button>
      </div>
    </div>
  )
}

// ─── Day Card ────────────────────────────────────────────────────────────────

interface DayCardProps {
  day: import('../lib/types').TripDay
  dayIndex: number
  dayTotals: DayTotals
  carbGoalPerMeal: number
  resortParks: import('../lib/types').Park[]
  canRemove: boolean
  onAssignPark: (parkId: string | null) => void
  onAddItem: (mealIndex: number, item: MealItem) => void
  onRemoveItem: (mealIndex: number, itemIndex: number) => void
  onRemoveDay: () => void
}

function DayCard({ day, dayIndex, dayTotals, carbGoalPerMeal, resortParks, canRemove, onAssignPark, onRemoveItem, onRemoveDay }: DayCardProps) {
  const selectedPark = resortParks.find(p => p.id === day.parkId)

  return (
    <div className="rounded-xl bg-white border border-stone-200 shadow-sm overflow-hidden">
      {/* Day header */}
      <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-100">
        <h3 className="font-bold text-stone-900">Day {dayIndex + 1}</h3>
        <div className="flex items-center gap-2">
          <select
            value={day.parkId ?? ''}
            onChange={e => onAssignPark(e.target.value || null)}
            className="text-sm rounded-lg border border-stone-300 px-2 py-1 max-w-[180px]"
            aria-label={`Park for day ${dayIndex + 1}`}
          >
            <option value="">Select park...</option>
            {resortParks.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {canRemove && (
            <button
              onClick={onRemoveDay}
              className="text-stone-400 hover:text-red-500"
              aria-label={`Remove day ${dayIndex + 1}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {selectedPark && (
        <div className="px-4 py-1.5 text-xs text-stone-500 bg-stone-50/50">
          {selectedPark.name} &middot; {selectedPark.location}
        </div>
      )}

      {/* Meal slots */}
      <div className="divide-y divide-stone-100">
        {day.meals.map((meal, mealIndex) => {
          const mealCarbs = meal.items.reduce((s, i) => s + i.carbs, 0)
          const carbPct = carbGoalPerMeal > 0 ? Math.min(100, Math.round((mealCarbs / carbGoalPerMeal) * 100)) : 0
          const barColor = carbPct >= 100 ? 'bg-red-500' : carbPct >= 75 ? 'bg-yellow-500' : 'bg-green-500'

          return (
            <div key={mealIndex} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-stone-700">{meal.name}</span>
                <span className="text-xs text-stone-400">
                  {mealCarbs}g / {carbGoalPerMeal}g carbs
                </span>
              </div>

              {/* Carb progress bar */}
              {meal.items.length > 0 && (
                <div className="h-1.5 rounded-full bg-stone-200 mb-2">
                  <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${carbPct}%` }} />
                </div>
              )}

              {/* Items in this meal slot */}
              {meal.items.length > 0 ? (
                <ul className="space-y-1">
                  {meal.items.map((item, itemIndex) => {
                    const grade = computeGrade(computeScore({
                      calories: item.calories, carbs: item.carbs, fat: item.fat,
                      protein: item.protein, sugar: item.sugar, fiber: item.fiber,
                      sodium: item.sodium,
                    }))
                    return (
                      <li key={`${item.id}-${itemIndex}`} className="flex items-center gap-2 text-sm">
                        <GradeBadge grade={grade} size="sm" />
                        <span className="flex-1 truncate text-stone-800">{item.name}</span>
                        <span className="text-xs font-medium text-stone-500">{item.carbs}g</span>
                        <button
                          onClick={() => onRemoveItem(mealIndex, itemIndex)}
                          className="text-stone-300 hover:text-red-500"
                          aria-label={`Remove ${item.name}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-xs text-stone-400 italic">No items — browse a park to add food</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Day totals footer */}
      {dayTotals.itemCount > 0 && (
        <div className="px-4 py-2 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
          <span>{dayTotals.itemCount} items</span>
          <span className="font-medium">{dayTotals.carbs}g carbs &middot; {dayTotals.calories} cal &middot; {dayTotals.protein}g protein</span>
        </div>
      )}
    </div>
  )
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-2 text-center">
      <p className="font-bold text-sm text-stone-900">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

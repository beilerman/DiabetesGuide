import { useMealCart } from '../../hooks/useMealCart'
import { usePreferences } from '../../hooks/usePreferences'
import { Link } from 'react-router-dom'

export function MealCart() {
  const { items, removeItem, clear, totals } = useMealCart()
  const { carbGoal } = usePreferences()
  const pct = carbGoal > 0 ? Math.min(100, Math.round((totals.carbs / carbGoal) * 100)) : 0

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-20 right-4 w-80 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-stone-900">Meal Tracker ({items.length})</h3>
        <button onClick={clear} className="text-xs text-rose-600 hover:underline">Clear</button>
      </div>

      <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex justify-between">
            <span className="truncate text-stone-700">{item.name}</span>
            <div className="flex gap-2 shrink-0">
              <span className="text-stone-500">{item.carbs}g</span>
              <button onClick={() => removeItem(i)} className="text-rose-500 text-xs">✕</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 text-sm font-medium text-stone-700">
        Carbs: {totals.carbs}g · Cal: {totals.calories} · Fat: {totals.fat}g
      </div>

      {carbGoal > 0 && (
        <div className="mt-2">
          <div className="h-2 rounded-full bg-stone-200">
            <div
              className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-1">{totals.carbs}/{carbGoal}g carb goal</p>
        </div>
      )}

      <Link
        to="/meal"
        className="mt-3 block text-center rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        Open meal details
      </Link>
    </div>
  )
}

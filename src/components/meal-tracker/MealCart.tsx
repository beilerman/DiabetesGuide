import { useMealCart } from '../../hooks/useMealCart'
import { usePreferences } from '../../hooks/usePreferences'
import { Link } from 'react-router-dom'

export function MealCart() {
  const { items, removeItem, clear, totals } = useMealCart()
  const { carbGoal } = usePreferences()
  const pct = carbGoal > 0 ? Math.min(100, Math.round((totals.carbs / carbGoal) * 100)) : 0

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-20 right-4 w-80 rounded-xl border bg-white p-4 shadow-lg z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Meal Tracker ({items.length})</h3>
        <button onClick={clear} className="text-xs text-red-600 hover:underline">Clear</button>
      </div>

      <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex justify-between">
            <span className="truncate">{item.name}</span>
            <div className="flex gap-2 shrink-0">
              <span className="text-gray-500">{item.carbs}g</span>
              <button onClick={() => removeItem(i)} className="text-red-500 text-xs">✕</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 text-sm font-medium">
        Carbs: {totals.carbs}g · Cal: {totals.calories} · Fat: {totals.fat}g
      </div>

      {carbGoal > 0 && (
        <div className="mt-1">
          <div className="h-2 rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{totals.carbs}/{carbGoal}g carb goal</p>
        </div>
      )}

      <Link
        to={`/insulin?carbs=${totals.carbs}`}
        className="mt-2 block text-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
      >
        Use in Insulin Helper
      </Link>
    </div>
  )
}

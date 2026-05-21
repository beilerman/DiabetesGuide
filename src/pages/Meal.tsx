import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMealCart } from '../hooks/useMealCart'
import { usePreferences } from '../hooks/usePreferences'
import { GradeBadge } from '../components/menu/GradeBadge'
import { computeScore, computeGrade, GRADE_CONFIG } from '../lib/grade'
import type { Grade } from '../lib/grade'

export default function Meal() {
  const {
    items, totals, activeMealId, activeMealName, meals, mealIds,
    removeItem, clear, createMeal, switchMeal, deleteMeal, renameMeal,
  } = useMealCart()
  const { carbGoal } = usePreferences()

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(activeMealName)
  const [showNewMeal, setShowNewMeal] = useState(false)
  const [newMealName, setNewMealName] = useState('')

  // Sync name input when switching meals
  useEffect(() => {
    setNameInput(activeMealName)
    setEditingName(false)
  }, [activeMealName])

  const netCarbs = Math.max(0, totals.carbs - totals.fiber)

  // Meal composite grade
  const mealGradeResult = useMemo(() => {
    if (items.length === 0) return { score: null, grade: null as Grade | null }
    const score = computeScore({
      calories: totals.calories,
      carbs: totals.carbs,
      fat: totals.fat,
      protein: totals.protein,
      sugar: totals.sugar,
      fiber: totals.fiber,
      sodium: totals.sodium,
    })
    return { score, grade: computeGrade(score) }
  }, [items.length, totals])

  // Carb goal progress
  const carbPct = carbGoal > 0 ? Math.min(100, Math.round((totals.carbs / carbGoal) * 100)) : 0
  const carbBarColor = carbPct >= 100 ? 'bg-rose-500' : carbPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'

  const handleRename = () => {
    if (nameInput.trim()) {
      renameMeal(activeMealId, nameInput.trim())
    }
    setEditingName(false)
  }

  const handleCreateMeal = () => {
    if (newMealName.trim()) {
      createMeal(newMealName.trim())
      setNewMealName('')
      setShowNewMeal(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Meal selector tabs */}
      <div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {mealIds.map(id => (
            <button
              key={id}
              onClick={() => switchMeal(id)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                id === activeMealId
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {meals[id].name}
              {meals[id].items.length > 0 && (
                <span className="ml-1 text-xs opacity-75">({meals[id].items.length})</span>
              )}
            </button>
          ))}
          <button
            onClick={() => setShowNewMeal(true)}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center text-lg"
            aria-label="Add new meal"
          >
            +
          </button>
        </div>

        {showNewMeal && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newMealName}
              onChange={e => setNewMealName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateMeal()}
              placeholder="Meal name (e.g. EPCOT Lunch)"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
              autoFocus
            />
            <button onClick={handleCreateMeal} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-medium">
              Add
            </button>
            <button onClick={() => { setShowNewMeal(false); setNewMealName('') }} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-600 text-sm">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Active meal header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              className="text-2xl font-bold border-b-2 border-teal-500 outline-none bg-transparent"
              autoFocus
            />
          ) : (
            <h1
              className="text-2xl font-bold text-stone-900 cursor-pointer hover:text-teal-600"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {activeMealName}
            </h1>
          )}
        </div>
        <div className="flex gap-3">
          {items.length > 0 && (
            <button onClick={clear} className="text-xs text-rose-600 hover:underline">
              Clear items
            </button>
          )}
          {mealIds.length > 1 && (
            <button onClick={() => deleteMeal(activeMealId)} className="text-xs text-stone-400 hover:text-rose-500">
              Delete meal
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Item List */}
      <section aria-label="Meal items">
        {items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-stone-300 p-10 text-center text-stone-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-stone-600">No items in this meal yet</p>
            <p className="text-sm mt-1">Browse a park or search to add food items</p>
            <Link to="/search" className="inline-block mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
              Search items
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item, i) => {
              const itemGrade = computeGrade(computeScore({
                calories: item.calories, carbs: item.carbs, fat: item.fat,
                protein: item.protein, sugar: item.sugar, fiber: item.fiber,
                sodium: item.sodium,
              }))
              return (
                <li key={`${item.id}-${i}`} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm border border-stone-200">
                  <GradeBadge grade={itemGrade} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate text-stone-900">{item.name}</p>
                    {item.restaurant && (
                      <p className="text-xs text-stone-500 truncate">{item.restaurant}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-stone-900">{item.carbs}g</p>
                    <p className="text-xs text-stone-500">{item.calories} cal</p>
                  </div>
                  <button
                    onClick={() => removeItem(i)}
                    className="flex-shrink-0 w-8 h-8 rounded-full text-stone-400 hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center"
                    aria-label={`Remove ${item.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Section 2: Meal Totals */}
      {items.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200" aria-label="Meal totals">
          <div className="flex items-center gap-4 mb-5">
            <GradeBadge grade={mealGradeResult.grade} size="lg" />
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500 font-semibold">Meal Grade</p>
              <p className="font-semibold text-lg" style={{ color: mealGradeResult.grade ? GRADE_CONFIG[mealGradeResult.grade].bg : '#78716c' }}>
                {mealGradeResult.grade ? GRADE_CONFIG[mealGradeResult.grade].label : 'No grade'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <MacroBox label="Total Carbs" value={`${totals.carbs}g`} highlight />
            <MacroBox label="Net Carbs" value={`${netCarbs}g`} />
            <MacroBox label="Calories" value={`${totals.calories}`} />
            <MacroBox label="Protein" value={`${totals.protein}g`} />
            <MacroBox label="Fat" value={`${totals.fat}g`} />
            <MacroBox label="Fiber" value={`${totals.fiber}g`} />
          </div>

          {/* Carb goal progress */}
          {carbGoal > 0 && (
            <div>
              <div className="flex justify-between text-xs text-stone-600 mb-1.5">
                <span className="font-medium">Carb goal</span>
                <span>{totals.carbs} / {carbGoal}g ({carbPct}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-stone-200 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all ${carbBarColor}`}
                  style={{ width: `${carbPct}%` }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Advanced tools entry — calculator gated behind acknowledgment */}
      {items.length > 0 && (
        <section aria-label="Advanced tools">
          <Link
            to={`/insulin?carbs=${totals.carbs}`}
            className="group block rounded-2xl bg-white border border-stone-200 p-4 hover:border-rose-300 hover:bg-rose-50/30 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.378-1.066 3.79A38.158 38.158 0 0112 21.75c-2.722 0-5.39-.285-7.978-.836-1.715-.365-2.298-2.523-1.066-3.79L5 14.5" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-stone-900">Insulin Dose Helper</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">Advanced</span>
                </div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Educational tool — not medical advice. Requires acknowledgment.
                </p>
              </div>
              <svg className="w-5 h-5 text-stone-400 group-hover:text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </section>
      )}
    </div>
  )
}

function MacroBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? 'bg-teal-50' : 'bg-stone-50'}`}>
      <p className={`font-bold ${highlight ? 'text-xl text-teal-700' : 'text-base text-stone-900'}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
    </div>
  )
}

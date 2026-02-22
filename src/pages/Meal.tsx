import { useState, useMemo, useEffect } from 'react'
import { useMealCart } from '../hooks/useMealCart'
import { usePreferences } from '../hooks/usePreferences'
import { GradeBadge } from '../components/menu/GradeBadge'
import { computeScore, computeGrade, GRADE_CONFIG } from '../lib/grade'
import type { Grade } from '../lib/grade'

const INSULIN_SETTINGS_KEY = 'dg_insulin_settings'

interface InsulinSettings {
  icr: number | ''
  cf: number | ''
  target: number
}

function loadInsulinSettings(): InsulinSettings {
  try {
    const raw = localStorage.getItem(INSULIN_SETTINGS_KEY)
    if (!raw) return { icr: '', cf: '', target: 120 }
    return { icr: '', cf: '', target: 120, ...JSON.parse(raw) }
  } catch {
    return { icr: '', cf: '', target: 120 }
  }
}

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

  // Insulin calculator state
  const [insulinSettings, setInsulinSettings] = useState<InsulinSettings>(loadInsulinSettings)
  const [bg, setBg] = useState<number | ''>('')
  const [carbOverride, setCarbOverride] = useState<number | null>(null)
  const [activity, setActivity] = useState<'none' | 'mod' | 'high'>('none')

  // Persist insulin settings
  useEffect(() => {
    localStorage.setItem(INSULIN_SETTINGS_KEY, JSON.stringify(insulinSettings))
  }, [insulinSettings])

  // Reset carb override when meal changes
  useEffect(() => {
    setCarbOverride(null)
  }, [activeMealId])

  // Sync name input when switching meals
  useEffect(() => {
    setNameInput(activeMealName)
    setEditingName(false)
  }, [activeMealName])

  const effectiveCarbs = carbOverride ?? totals.carbs
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

  // Insulin calculation
  const insulinResult = useMemo(() => {
    const { icr, cf, target } = insulinSettings
    if (effectiveCarbs === 0 || icr === '' || bg === '') return null
    if (Number(icr) <= 0) return null

    const carbBolus = effectiveCarbs / Number(icr)
    const cfVal = Number(cf)
    const bgVal = Number(bg)
    const correction = cfVal && bgVal !== target ? (bgVal - target) / cfVal : 0
    const baseDose = carbBolus + correction
    const adjPct = activity === 'mod' ? 0.25 : activity === 'high' ? 0.5 : 0
    const suggested = Math.max(0, baseDose * (1 - adjPct))

    return {
      carbBolus: Math.round(carbBolus * 10) / 10,
      correction: Math.round(correction * 10) / 10,
      adjPct: Math.round(adjPct * 100),
      suggested: Math.round(suggested * 10) / 10,
    }
  }, [effectiveCarbs, bg, insulinSettings, activity])

  // Carb goal progress
  const carbPct = carbGoal > 0 ? Math.min(100, Math.round((totals.carbs / carbGoal) * 100)) : 0
  const carbBarColor = carbPct >= 100 ? 'bg-red-500' : carbPct >= 75 ? 'bg-yellow-500' : 'bg-green-500'

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
    <div className="max-w-lg mx-auto space-y-6">
      {/* Medical disclaimer */}
      <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
        <p className="text-sm font-semibold text-amber-800">
          Educational tool only — not medical advice. Always consult your healthcare provider.
        </p>
      </div>

      {/* Meal selector tabs */}
      <div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {mealIds.map(id => (
            <button
              key={id}
              onClick={() => switchMeal(id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                id === activeMealId
                  ? 'bg-teal-600 text-white'
                  : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
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
            className="flex-shrink-0 w-8 h-8 rounded-full bg-stone-200 text-stone-500 hover:bg-stone-300 flex items-center justify-center text-lg"
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
              className="text-xl font-bold border-b-2 border-teal-500 outline-none bg-transparent"
              autoFocus
            />
          ) : (
            <h1
              className="text-xl font-bold cursor-pointer hover:text-teal-600"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {activeMealName}
            </h1>
          )}
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button onClick={clear} className="text-xs text-red-600 hover:underline">
              Clear items
            </button>
          )}
          {mealIds.length > 1 && (
            <button onClick={() => deleteMeal(activeMealId)} className="text-xs text-stone-400 hover:text-red-500">
              Delete meal
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Item List */}
      <section aria-label="Meal items">
        {items.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-stone-300 p-8 text-center text-stone-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">No items in this meal</p>
            <p className="text-sm mt-1">Browse a park or search to add food items</p>
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
                <li key={`${item.id}-${i}`} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm border border-stone-100">
                  <GradeBadge grade={itemGrade} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    {item.restaurant && (
                      <p className="text-xs text-stone-400 truncate">{item.restaurant}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm">{item.carbs}g</p>
                    <p className="text-xs text-stone-400">{item.calories} cal</p>
                  </div>
                  <button
                    onClick={() => removeItem(i)}
                    className="flex-shrink-0 w-7 h-7 rounded-full text-stone-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center"
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
        <section className="rounded-xl bg-white p-4 shadow-sm border border-stone-100" aria-label="Meal totals">
          <div className="flex items-center gap-4 mb-4">
            <GradeBadge grade={mealGradeResult.grade} size="lg" />
            <div>
              <p className="text-sm text-stone-500">Meal Grade</p>
              <p className="font-semibold" style={{ color: mealGradeResult.grade ? GRADE_CONFIG[mealGradeResult.grade].bg : '#78716c' }}>
                {mealGradeResult.grade ? GRADE_CONFIG[mealGradeResult.grade].label : 'No grade'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
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
              <div className="flex justify-between text-xs text-stone-500 mb-1">
                <span>Carb goal</span>
                <span>{totals.carbs}/{carbGoal}g ({carbPct}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-stone-200">
                <div
                  className={`h-2.5 rounded-full transition-all ${carbBarColor}`}
                  style={{ width: `${carbPct}%` }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Section 3: Inline Insulin Calculator */}
      <section className="rounded-xl bg-white p-4 shadow-sm border border-stone-100" aria-label="Insulin calculator">
        <h2 className="text-lg font-bold mb-4">Insulin Calculator</h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Blood Glucose (mg/dL)"
              value={bg}
              onChange={setBg}
            />
            <NumField
              label="Target Glucose"
              value={insulinSettings.target}
              onChange={v => setInsulinSettings(s => ({ ...s, target: v || 120 }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Total Carbs (g)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                value={carbOverride ?? totals.carbs}
                onChange={e => setCarbOverride(e.target.value === '' ? null : Number(e.target.value))}
              />
              {carbOverride !== null && (
                <button
                  onClick={() => setCarbOverride(null)}
                  className="text-xs text-teal-600 hover:underline whitespace-nowrap"
                >
                  Reset to {totals.carbs}g
                </button>
              )}
            </div>
            {items.length > 0 && carbOverride === null && (
              <p className="text-xs text-stone-400 mt-0.5">Auto-populated from meal ({items.length} items)</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Insulin-to-Carb Ratio (ICR)"
              value={insulinSettings.icr}
              onChange={v => setInsulinSettings(s => ({ ...s, icr: v }))}
            />
            <NumField
              label="Correction Factor"
              value={insulinSettings.cf}
              onChange={v => setInsulinSettings(s => ({ ...s, cf: v }))}
            />
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-stone-600 mb-1">Activity Level</legend>
            <div className="flex gap-3">
              {([['none', 'None'], ['mod', 'Moderate (-25%)'], ['high', 'High (-50%)']] as const).map(
                ([val, label]) => (
                  <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="activity"
                      checked={activity === val}
                      onChange={() => setActivity(val)}
                      className="accent-teal-600"
                    />
                    {label}
                  </label>
                )
              )}
            </div>
          </fieldset>
        </div>

        {insulinResult && (
          <div className="mt-4 rounded-lg bg-teal-50 border border-teal-200 p-4 space-y-2">
            <h3 className="font-semibold text-teal-800 text-sm">Dose Breakdown</h3>
            <ResultRow label="Carb Bolus" value={`${insulinResult.carbBolus} units`} />
            <ResultRow label="Correction Dose" value={`${insulinResult.correction} units`} />
            {insulinResult.adjPct > 0 && (
              <ResultRow label="Activity Adjustment" value={`-${insulinResult.adjPct}%`} />
            )}
            <div className="border-t border-teal-200 pt-2 mt-2">
              <div className="flex justify-between font-bold text-teal-900">
                <span>Suggested Dose</span>
                <span className="text-lg">{insulinResult.suggested} units</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function MacroBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${highlight ? 'bg-teal-50' : 'bg-stone-50'}`}>
      <p className={`font-bold ${highlight ? 'text-lg text-teal-700' : 'text-sm'}`}>{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

function NumField({ label, value, onChange }: {
  label: string
  value: number | ''
  onChange: (v: number | '') => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-stone-600">{label}</span>
      <input
        type="number"
        className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </label>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-teal-700">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

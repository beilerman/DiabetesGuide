import { useEffect } from 'react'
import { useCompare } from '../../hooks/useCompare'
import type { CompareItem } from '../../hooks/useCompare'
import { GradeBadge } from '../menu/GradeBadge'
import { computeScore, computeGrade, GRADE_CONFIG } from '../../lib/grade'
import { useMealCart } from '../../hooks/useMealCart'

interface Props {
  onClose: () => void
}

interface MetricRow {
  label: string
  key: keyof CompareItem | 'netCarbs' | 'grade'
  unit?: string
  lowerIsBetter?: boolean
  format?: (item: CompareItem) => string | number
}

const diabetesMetrics: MetricRow[] = [
  { label: 'Carbs', key: 'carbs', unit: 'g', lowerIsBetter: true },
  { label: 'Net Carbs', key: 'netCarbs', unit: 'g', lowerIsBetter: true, format: i => Math.max(0, i.carbs - i.fiber) },
  { label: 'Sugar', key: 'sugar', unit: 'g', lowerIsBetter: true },
  { label: 'Fiber', key: 'fiber', unit: 'g', lowerIsBetter: false },
]

const macroMetrics: MetricRow[] = [
  { label: 'Calories', key: 'calories', lowerIsBetter: true },
  { label: 'Protein', key: 'protein', unit: 'g', lowerIsBetter: false },
  { label: 'Fat', key: 'fat', unit: 'g', lowerIsBetter: true },
]

const otherMetrics: MetricRow[] = [
  { label: 'Sodium', key: 'sodium', unit: 'mg', lowerIsBetter: true },
  { label: 'Price', key: 'price', unit: '', format: i => i.price != null ? `$${i.price.toFixed(2)}` : '—' },
]

function getValue(item: CompareItem, metric: MetricRow): number | string {
  if (metric.format) return metric.format(item)
  const v = item[metric.key as keyof CompareItem]
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v
  return 0
}

function getNumericValue(item: CompareItem, metric: MetricRow): number {
  if (metric.format) {
    const v = metric.format(item)
    return typeof v === 'number' ? v : NaN
  }
  const v = item[metric.key as keyof CompareItem]
  return typeof v === 'number' ? v : NaN
}

function getBestIndex(items: CompareItem[], metric: MetricRow): number {
  let bestIdx = 0
  let bestVal = getNumericValue(items[0], metric)
  for (let i = 1; i < items.length; i++) {
    const v = getNumericValue(items[i], metric)
    if (isNaN(v)) continue
    if (isNaN(bestVal) || (metric.lowerIsBetter ? v < bestVal : v > bestVal)) {
      bestVal = v
      bestIdx = i
    }
  }
  return isNaN(bestVal) ? -1 : bestIdx
}

function getGrade(item: CompareItem) {
  const score = computeScore({
    calories: item.calories, carbs: item.carbs, fat: item.fat,
    protein: item.protein, sugar: item.sugar, fiber: item.fiber,
    sodium: item.sodium,
  })
  return { score, grade: computeGrade(score) }
}

export function ComparisonModal({ onClose }: Props) {
  const { compareItems, clearCompare } = useCompare()
  const { addItem } = useMealCart()

  // Trap focus / close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (compareItems.length < 2) return null

  const grades = compareItems.map(getGrade)
  const colWidth = `${Math.floor(100 / compareItems.length)}%`

  const handleAddToMeal = (item: CompareItem) => {
    addItem({
      id: item.id,
      name: item.name,
      carbs: item.carbs,
      calories: item.calories,
      fat: item.fat,
      protein: item.protein,
      sugar: item.sugar,
      fiber: item.fiber,
      sodium: item.sodium,
      restaurant: item.restaurant ?? undefined,
      parkName: item.parkName ?? undefined,
    })
  }

  const renderSection = (title: string, metrics: MetricRow[]) => (
    <div className="mb-4">
      <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 px-1">{title}</h3>
      <div className="space-y-1">
        {metrics.map(metric => {
          const bestIdx = getBestIndex(compareItems, metric)
          return (
            <div key={metric.label} className="flex items-center">
              <div className="w-20 text-xs text-stone-500 flex-shrink-0 pr-2">{metric.label}</div>
              <div className="flex-1 flex">
                {compareItems.map((item, i) => {
                  const val = getValue(item, metric)
                  const isBest = i === bestIdx && compareItems.length > 1
                  return (
                    <div
                      key={item.id}
                      className={`flex-1 text-center py-1 text-sm font-medium rounded ${
                        isBest ? 'bg-green-50 text-green-700' : 'text-stone-700'
                      }`}
                    >
                      {typeof val === 'number' ? val : val}
                      {typeof val === 'number' && metric.unit ? <span className="text-xs text-stone-400">{metric.unit}</span> : null}
                      {isBest && <span className="ml-1 text-[10px]">&#9679;</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Compare items"
    >
      <div className="w-full max-w-2xl mx-4 my-8 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-bold text-stone-900">Compare Items</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400"
            aria-label="Close comparison"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Item headers with grades */}
        <div className="flex p-4 gap-2 border-b border-stone-100">
          {compareItems.map((item, i) => (
            <div key={item.id} className="flex-1 text-center" style={{ maxWidth: colWidth }}>
              <div className="flex justify-center mb-2">
                <GradeBadge grade={grades[i].grade} size="lg" />
              </div>
              <p className="text-sm font-semibold text-stone-900 truncate">{item.name}</p>
              <p className="text-xs text-stone-400 truncate">{item.restaurant}</p>
              {grades[i].grade && (
                <p className="text-[10px] font-medium mt-1" style={{ color: GRADE_CONFIG[grades[i].grade!].bg }}>
                  {GRADE_CONFIG[grades[i].grade!].label}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Metrics */}
        <div className="p-4">
          {renderSection('Diabetes Impact', diabetesMetrics)}
          {renderSection('Macros', macroMetrics)}
          {renderSection('Other', otherMetrics)}
        </div>

        {/* Add to Meal buttons */}
        <div className="flex gap-2 p-4 border-t border-stone-200">
          {compareItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleAddToMeal(item)}
              className="flex-1 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
              Add {item.name.length > 15 ? item.name.slice(0, 15) + '...' : item.name}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-center p-3 border-t border-stone-100">
          <button
            onClick={() => { clearCompare(); onClose() }}
            className="text-xs text-stone-400 hover:text-red-500"
          >
            Clear comparison
          </button>
        </div>
      </div>
    </div>
  )
}

import { useCompare } from '../../hooks/useCompare'

interface Props {
  onOpenModal: () => void
}

export function ComparisonTray({ onOpenModal }: Props) {
  const { compareItems, removeFromCompare, clearCompare } = useCompare()

  if (compareItems.length === 0) return null

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Item pills */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto">
          {compareItems.map(item => (
            <span
              key={item.id}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 rounded-full text-sm"
            >
              <span className="font-medium truncate max-w-[120px]">{item.name}</span>
              <button
                onClick={() => removeFromCompare(item.id)}
                className="w-4 h-4 flex items-center justify-center rounded-full text-stone-400 hover:text-red-500 hover:bg-red-50"
                aria-label={`Remove ${item.name} from comparison`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={clearCompare}
            className="text-xs text-stone-400 hover:text-red-500"
          >
            Clear
          </button>
          <button
            onClick={onOpenModal}
            disabled={compareItems.length < 2}
            className="px-4 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Compare ({compareItems.length})
          </button>
        </div>
      </div>
    </div>
  )
}

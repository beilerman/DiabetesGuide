import { usePreferences } from '../../hooks/usePreferences'

export function AccessibilityControls() {
  const { fontScale, highContrast, setFontScale, toggleContrast } = usePreferences()

  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => setFontScale(fontScale - 0.1)}
        className="rounded border px-2 py-1 hover:bg-gray-100"
        aria-label="Decrease font size"
      >
        A-
      </button>
      <span className="min-w-[3ch] text-center">{Math.round(fontScale * 100)}%</span>
      <button
        onClick={() => setFontScale(fontScale + 0.1)}
        className="rounded border px-2 py-1 hover:bg-gray-100"
        aria-label="Increase font size"
      >
        A+
      </button>
      <button
        onClick={toggleContrast}
        className={`rounded border px-2 py-1 hover:bg-gray-100 ${highContrast ? 'bg-yellow-300 text-black' : ''}`}
        aria-label="Toggle high contrast"
      >
        {highContrast ? '◑ On' : '◑ Off'}
      </button>
    </div>
  )
}

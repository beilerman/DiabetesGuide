import { usePreferences } from '../hooks/usePreferences'

export function ContrastToggle() {
  const { highContrast, toggleContrast } = usePreferences()
  const label = highContrast ? 'Disable high contrast' : 'Enable high contrast'

  return (
    <button
      type="button"
      onClick={toggleContrast}
      aria-label={label}
      aria-pressed={highContrast}
      title={label}
      className={`ml-2 flex h-8 items-center justify-center rounded-lg border transition-colors ${
        highContrast
          ? 'w-auto gap-1.5 border-teal-700 bg-teal-700 px-2 text-white'
          : 'w-8 border-stone-300 text-stone-500 hover:bg-stone-50'
      }`}
    >
      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" />
      </svg>
      {highContrast && (
        <span className="whitespace-nowrap text-xs font-semibold">Contrast: on</span>
      )}
    </button>
  )
}

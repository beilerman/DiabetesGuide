import { usePreferences } from '../hooks/usePreferences'
import { clearOfflineData } from '../lib/offline-db'
import { useState } from 'react'

export default function Settings() {
  const { fontScale, highContrast, carbGoal, setFontScale, toggleContrast, setCarbGoal } = usePreferences()
  const [cleared, setCleared] = useState(false)

  const handleClearCache = async () => {
    await clearOfflineData()
    localStorage.removeItem('dg_meal_cart')
    localStorage.removeItem('dg_favorites')
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
  }

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-3xl font-bold text-stone-900">Settings</h1>

      {/* Accessibility */}
      <section aria-labelledby="a11y-heading">
        <h2 id="a11y-heading" className="text-lg font-semibold text-stone-800 mb-4">Accessibility</h2>
        <div className="space-y-5 rounded-2xl bg-white border border-stone-200 p-5">
          {/* Font Size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="font-scale" className="text-sm font-medium text-stone-700">Text Size</label>
              <span className="text-sm text-stone-500">{Math.round(fontScale * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFontScale(fontScale - 0.1)}
                className="w-10 h-10 rounded-xl border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-50 active:bg-stone-100"
                aria-label="Decrease text size"
              >
                A-
              </button>
              <input
                id="font-scale"
                type="range"
                min="0.8"
                max="1.6"
                step="0.1"
                value={fontScale}
                onChange={e => setFontScale(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-stone-200 rounded-lg accent-teal-600"
                aria-valuemin={80}
                aria-valuemax={160}
                aria-valuenow={Math.round(fontScale * 100)}
                aria-valuetext={`${Math.round(fontScale * 100)} percent`}
              />
              <button
                onClick={() => setFontScale(fontScale + 0.1)}
                className="w-10 h-10 rounded-xl border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-50 active:bg-stone-100"
                aria-label="Increase text size"
              >
                A+
              </button>
            </div>
          </div>

          {/* High Contrast */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">High Contrast</p>
              <p className="text-xs text-stone-500">Increase color contrast for visibility</p>
            </div>
            <button
              role="switch"
              aria-checked={highContrast}
              onClick={toggleContrast}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${highContrast ? 'bg-teal-600' : 'bg-stone-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${highContrast ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Nutrition Preferences */}
      <section aria-labelledby="nutrition-heading">
        <h2 id="nutrition-heading" className="text-lg font-semibold text-stone-800 mb-4">Nutrition</h2>
        <div className="space-y-4 rounded-2xl bg-white border border-stone-200 p-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="carb-goal" className="text-sm font-medium text-stone-700">Carb Goal per Meal</label>
              <span className="text-sm font-medium text-teal-600">{carbGoal}g</span>
            </div>
            <input
              id="carb-goal"
              type="range"
              min="15"
              max="120"
              step="5"
              value={carbGoal}
              onChange={e => setCarbGoal(parseInt(e.target.value))}
              className="w-full h-2 bg-stone-200 rounded-lg accent-teal-600"
              aria-valuemin={15}
              aria-valuemax={120}
              aria-valuenow={carbGoal}
              aria-valuetext={`${carbGoal} grams`}
            />
            <div className="flex justify-between text-xs text-stone-400 mt-1">
              <span>15g</span>
              <span>120g</span>
            </div>
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section aria-labelledby="data-heading">
        <h2 id="data-heading" className="text-lg font-semibold text-stone-800 mb-4">Data</h2>
        <div className="rounded-2xl bg-white border border-stone-200 p-5">
          <p className="text-sm text-stone-600 mb-3">Clear cached offline data, meal history, and favorites.</p>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 text-sm font-medium border border-rose-200 hover:bg-rose-100 active:bg-rose-200 transition-colors"
          >
            {cleared ? 'Cleared!' : 'Clear All App Data'}
          </button>
        </div>
      </section>

      {/* About */}
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-lg font-semibold text-stone-800 mb-4">About</h2>
        <div className="rounded-2xl bg-white border border-stone-200 p-5 text-sm text-stone-600 space-y-1">
          <p><span className="font-medium text-stone-700">DiabetesGuide</span> v1.0</p>
          <p>Nutritional info is estimated — always verify with restaurant staff.</p>
          <p className="text-xs text-stone-400">Not medical advice. Consult your healthcare provider.</p>
        </div>
      </section>
    </div>
  )
}

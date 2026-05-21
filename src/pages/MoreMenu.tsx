// src/pages/MoreMenu.tsx
import { Link } from 'react-router-dom'

const menuItems = [
  {
    to: '/packing',
    icon: '🎒',
    label: 'Packing List',
    description: 'Diabetes essentials for park days',
  },
  {
    to: '/guide',
    icon: '📖',
    label: 'Diabetes Guide',
    description: 'Type 1 & Type 2 education',
  },
  {
    to: '/advice',
    icon: '🎯',
    label: 'Park Day Tips',
    description: 'Managing diabetes at theme parks',
  },
  {
    to: '/settings',
    icon: '⚙️',
    label: 'Settings',
    description: 'Text size, contrast, carb goal',
  },
]

export default function MoreMenu() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold text-stone-900">More</h1>
        <p className="text-sm text-stone-600 mt-1">Resources, settings, and advanced tools.</p>
      </header>

      {/* Standard menu */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Resources</h2>
        <div className="space-y-2">
          {menuItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all"
            >
              <span className="text-3xl flex-shrink-0" aria-hidden="true">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-stone-900">{item.label}</h3>
                <p className="text-sm text-stone-600">{item.description}</p>
              </div>
              <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ))}
        </div>
      </section>

      {/* Advanced section — visually distinct */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-rose-600">Advanced</h2>
          <span className="text-xs text-stone-400">Use with caution</span>
        </div>

        <Link
          to="/insulin"
          className="block rounded-2xl bg-white border-2 border-rose-200 hover:border-rose-300 shadow-sm hover:shadow-md transition-all overflow-hidden"
        >
          <div className="p-4 flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.378-1.066 3.79A38.158 38.158 0 0112 21.75c-2.722 0-5.39-.285-7.978-.836-1.715-.365-2.298-2.523-1.066-3.79L5 14.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-stone-900">Insulin Dose Helper</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Advanced</span>
              </div>
              <p className="text-sm text-stone-600 mt-0.5">
                Educational dose estimator. Not medical advice.
              </p>
            </div>
            <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="bg-rose-50 border-t border-rose-200 px-4 py-2.5 text-xs text-rose-900">
            <strong>Important:</strong> Insulin can be dangerous. Only use ratios prescribed by your healthcare provider. Acknowledgment required before use.
          </div>
        </Link>
      </section>

      {/* Site disclaimer */}
      <p className="text-xs text-center text-stone-500 max-w-md mx-auto pt-4">
        DiabetesGuide provides educational information only. It is not medical advice, not FDA-reviewed, and not a substitute for professional clinical care.
      </p>
    </div>
  )
}

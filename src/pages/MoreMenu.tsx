// src/pages/MoreMenu.tsx
import { Link } from 'react-router-dom'

type IconName = 'calculator' | 'bag' | 'book' | 'target' | 'settings' | 'info' | 'shield'

const menuItems: Array<{
  to: string
  icon: IconName
  label: string
  description: string
}> = [
  {
    to: '/insulin',
    icon: 'calculator',
    label: 'Carb Estimator',
    description: 'Estimate carbs and corrections with safety guardrails',
  },
  {
    to: '/packing',
    icon: 'bag',
    label: 'Packing List',
    description: 'Diabetes essentials for park days',
  },
  {
    to: '/guide',
    icon: 'book',
    label: 'Diabetes Guide',
    description: 'Type 1 & Type 2 education',
  },
  {
    to: '/advice',
    icon: 'target',
    label: 'Park Day Tips',
    description: 'Managing diabetes at theme parks',
  },
  {
    to: '/settings',
    icon: 'settings',
    label: 'Settings',
    description: 'Text size, contrast, carb goal',
  },
  {
    to: '/methodology',
    icon: 'info',
    label: 'Data Sources',
    description: 'Nutrition confidence and sourcing',
  },
  {
    to: '/privacy',
    icon: 'shield',
    label: 'Privacy',
    description: 'Local storage and health data notes',
  },
]

const ICON_PATHS: Record<IconName, string[]> = {
  calculator: ['M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z', 'M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01'],
  bag: ['M6 8h12l1 12H5L6 8z', 'M9 8a3 3 0 016 0'],
  book: ['M5 4h10a4 4 0 014 4v12H9a4 4 0 00-4-4V4z', 'M5 4v12a4 4 0 014 4'],
  target: ['M12 4a8 8 0 100 16 8 8 0 000-16z', 'M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 11.5v1'],
  settings: ['M12 8a4 4 0 100 8 4 4 0 000-8z', 'M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4'],
  info: ['M12 5a7 7 0 100 14 7 7 0 000-14z', 'M12 10v5M12 8h.01'],
  shield: ['M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6l7-3z', 'M9 12l2 2 4-5'],
}

export default function MoreMenu() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-stone-900">More</h1>

      <div className="space-y-3">
        {menuItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-all hover:shadow-md"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Icon name={item.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-stone-900">{item.label}</h3>
              <p className="text-sm text-stone-600">{item.description}</p>
            </div>
            <svg className="h-5 w-5 flex-shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name].map(path => (
        <path key={path} d={path} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

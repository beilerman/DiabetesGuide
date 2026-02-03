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
]

export default function MoreMenu() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-stone-900">More</h1>

      <div className="space-y-3">
        {menuItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-stone-200 shadow-sm hover:shadow-md transition-all"
          >
            <span className="text-3xl">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-stone-900">{item.label}</h3>
              <p className="text-sm text-stone-600">{item.description}</p>
            </div>
            <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}

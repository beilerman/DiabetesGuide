// src/components/ui/Breadcrumb.tsx
import { Link } from 'react-router-dom'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface Props {
  items: BreadcrumbItem[]
  accentColor?: string
}

export function Breadcrumb({ items, accentColor }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          {i > 0 && (
            <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {item.to ? (
            <Link
              to={item.to}
              className="font-medium hover:underline transition-colors"
              style={{ color: accentColor || '#0d9488' }}
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-stone-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

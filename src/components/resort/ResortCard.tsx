// src/components/resort/ResortCard.tsx
import { Link } from 'react-router-dom'
import type { ResortConfig } from '../../lib/resort-config'

interface Props {
  resort: ResortConfig
  parkCount: number
  venueCount: number
  itemCount: number
}

export function ResortCard({ resort, parkCount, venueCount, itemCount }: Props) {
  return (
    <Link
      to={`/resort/${resort.id}`}
      className="block rounded-2xl overflow-hidden shadow-md hover:shadow-xl active:scale-[0.98] transition-all duration-200"
    >
      <div
        className="relative h-44 p-6 flex flex-col justify-end"
        style={{ background: resort.theme.gradient }}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 50%)'
        }} />

        <div className="relative z-10">
          <div className="text-4xl mb-2">{resort.icon}</div>
          <h2 className="text-2xl font-bold text-white leading-tight">{resort.name}</h2>
          <p className="text-white/70 text-sm mt-1">{resort.location}</p>
          <div className="flex items-center gap-3 mt-3 text-white/80 text-sm">
            {parkCount > 0 && (
              <span>{parkCount} {parkCount === 1 ? 'Park' : 'Parks'}</span>
            )}
            {venueCount > 0 && (
              <>
                <span className="text-white/40">·</span>
                <span>{venueCount} Venues</span>
              </>
            )}
            <span className="text-white/40">·</span>
            <span>{itemCount} Items</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

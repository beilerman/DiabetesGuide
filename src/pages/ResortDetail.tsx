// src/pages/ResortDetail.tsx
import { useParams } from 'react-router-dom'
import { useParks } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { CategoryCard } from '../components/resort/CategoryCard'
import { getResortById, getParksForCategory } from '../lib/resort-config'

export default function ResortDetail() {
  const { resortId } = useParams<{ resortId: string }>()
  const resort = getResortById(resortId || '')
  const { data: parks, isLoading, error } = useParks()

  if (!resort) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Resort not found</h2>
        <p className="text-stone-600">The destination you're looking for doesn't exist.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: resort.name },
        ]}
        accentColor={resort.theme.primary}
      />

      {/* Resort header with gradient banner */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: resort.theme.gradient }}
      >
        <div className="text-4xl mb-2">{resort.icon}</div>
        <h1 className="text-3xl font-bold">{resort.name}</h1>
        <p className="text-white/70 mt-1">{resort.location}</p>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
          <p className="text-red-700">Unable to load venues. Please try again later.</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4">
          {resort.categories.map(category => (
            <div
              key={category.id}
              className="rounded-2xl overflow-hidden border border-stone-200 animate-pulse"
            >
              <div className="p-5">
                <div className="h-8 w-8 bg-stone-200 rounded mb-2" />
                <div className="h-5 w-24 bg-stone-200 rounded mb-2" />
                <div className="h-4 w-16 bg-stone-200 rounded" />
              </div>
              <div className="h-1 bg-stone-200" />
            </div>
          ))}
        </div>
      )}

      {/* Category cards grid */}
      {!isLoading && !error && (
        <div className="grid grid-cols-2 gap-4">
          {resort.categories.map(category => {
            const categoryParks = parks ? getParksForCategory(parks, resort, category.id) : []
            return (
              <CategoryCard
                key={category.id}
                category={category}
                resortId={resort.id}
                theme={resort.theme}
                venueCount={categoryParks.length}
                itemCount={0}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useParams, Link } from 'react-router-dom'
import { useParks, useRestaurants } from '../lib/queries'

export default function Park() {
  const { id } = useParams<{ id: string }>()
  const { data: parks } = useParks()
  const { data: restaurants, isLoading } = useRestaurants(id)

  const park = parks?.find(p => p.id === id)

  if (!park) return <p>Park not found.</p>

  const byLand = (restaurants ?? []).reduce<Record<string, typeof restaurants>>((acc, r) => {
    const land = r.land || 'Other'
    if (!acc[land]) acc[land] = []
    acc[land]!.push(r)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-3xl font-bold">{park.name}</h1>
      <p className="text-gray-500 mb-6">{park.location}</p>

      {isLoading ? <p>Loading restaurants...</p> : (
        Object.entries(byLand).map(([land, rests]) => (
          <div key={land} className="mb-6">
            <h2 className="text-xl font-semibold mb-2">{land}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rests!.map(r => (
                <Link
                  key={r.id}
                  to={`/browse?park=${park.id}`}
                  className="rounded-lg border bg-white p-4 hover:shadow-sm transition"
                >
                  <h3 className="font-medium">{r.name}</h3>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

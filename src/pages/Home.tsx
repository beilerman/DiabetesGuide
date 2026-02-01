import { Link } from 'react-router-dom'
import { useParks } from '../lib/queries'

export default function Home() {
  const { data: parks, isLoading, error } = useParks()

  if (isLoading) return <p>Loading parks...</p>
  if (error) return <p className="text-red-600">Failed to load parks.</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Choose a Park</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {parks?.map(park => (
          <Link key={park.id} to={`/park/${park.id}`}
            className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition">
            <h2 className="text-lg font-semibold">{park.name}</h2>
            <p className="text-sm text-gray-500">{park.location}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

import { useMemo } from 'react'
import { useMenuItems } from '../lib/queries'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'

export default function Favorites() {
  const { data: items, isLoading } = useMenuItems()
  const { addItem } = useMealCart()
  const { favorites, isFavorite, toggle } = useFavorites()

  const favoriteItems = useMemo(() => {
    if (!items) return []
    return items.filter(item => favorites.has(item.id))
  }, [items, favorites])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Favorites</h1>
        <p className="text-stone-600 mt-1">
          {favoriteItems.length} saved {favoriteItems.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-md overflow-hidden animate-pulse">
              <div className="h-32 bg-gradient-to-br from-stone-200 to-stone-300" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-stone-200 rounded w-3/4" />
                <div className="h-4 bg-stone-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : favoriteItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favoriteItems.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onAddToMeal={addItem}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggle}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">💛</div>
          <h3 className="text-xl font-semibold text-stone-800 mb-2">No favorites yet</h3>
          <p className="text-stone-600">Tap the heart on any menu item to save it here.</p>
        </div>
      )}
    </div>
  )
}

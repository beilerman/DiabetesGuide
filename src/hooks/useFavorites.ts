import { useState, useCallback, useEffect } from 'react'
import { FAVORITES_STORAGE_KEY, toggleFavorite } from '../lib/favorites'

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]'))
  } catch { return new Set() }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(load)

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]))
  }, [favorites])

  const toggle = useCallback((id: string) => {
    setFavorites((prev) => toggleFavorite(prev, id))
  }, [])

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites])

  return { favorites, toggle, isFavorite }
}

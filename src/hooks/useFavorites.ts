import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'dg_favorites'

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch { return new Set() }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]))
  }, [favorites])

  const toggle = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites])

  return { favorites, toggle, isFavorite }
}

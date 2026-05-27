import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applyPageMeta, getPageMeta } from '../../lib/page-meta'

export function PageMeta() {
  const location = useLocation()

  useEffect(() => {
    applyPageMeta(getPageMeta(location.pathname))
  }, [location.pathname])

  return null
}

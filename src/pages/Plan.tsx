import { Navigate } from 'react-router-dom'

// Plan page is a future Phase 7 feature. For now, redirect to favorites.
export default function Plan() {
  return <Navigate to="/favorites" replace />
}

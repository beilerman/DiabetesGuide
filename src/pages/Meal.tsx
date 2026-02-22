import { Navigate } from 'react-router-dom'

// Meal page is a future Phase 5 feature. For now, redirect to the existing InsulinHelper.
export default function Meal() {
  return <Navigate to="/insulin" replace />
}

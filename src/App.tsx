import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'

// Eagerly load Home (first paint) — lazy-load everything else
import Home from './pages/Home'

const ParkDetail = lazy(() => import('./pages/ParkDetail'))
const Search = lazy(() => import('./pages/Search'))
const Browse = lazy(() => import('./pages/Browse'))
const Meal = lazy(() => import('./pages/Meal'))
const Plan = lazy(() => import('./pages/Plan'))
const Favorites = lazy(() => import('./pages/Favorites'))
const MoreMenu = lazy(() => import('./pages/MoreMenu'))
const Settings = lazy(() => import('./pages/Settings'))
const InsulinHelper = lazy(() => import('./pages/InsulinHelper'))
const PackingList = lazy(() => import('./pages/PackingList'))
const DiabetesGuide = lazy(() => import('./pages/DiabetesGuide'))
const ParkAdvice = lazy(() => import('./pages/ParkAdvice'))

// Legacy pages
const ResortDetail = lazy(() => import('./pages/ResortDetail'))
const VenueList = lazy(() => import('./pages/VenueList'))
const VenueMenu = lazy(() => import('./pages/VenueMenu'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Loading page">
      <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/park/:parkId" element={<ParkDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/meal" element={<Meal />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/more" element={<MoreMenu />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/insulin" element={<InsulinHelper />} />
          <Route path="/packing" element={<PackingList />} />
          <Route path="/guide" element={<DiabetesGuide />} />
          <Route path="/advice" element={<ParkAdvice />} />

          {/* Legacy resort routes */}
          <Route path="/resort/:resortId" element={<ResortDetail />} />
          <Route path="/resort/:resortId/:categoryId" element={<VenueList />} />
          <Route path="/resort/:resortId/:categoryId/:parkId" element={<VenueMenu />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

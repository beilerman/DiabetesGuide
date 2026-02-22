import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import ParkDetail from './pages/ParkDetail'
import Search from './pages/Search'
import Meal from './pages/Meal'
import Plan from './pages/Plan'
import Favorites from './pages/Favorites'
import MoreMenu from './pages/MoreMenu'
import InsulinHelper from './pages/InsulinHelper'
import PackingList from './pages/PackingList'
import DiabetesGuide from './pages/DiabetesGuide'
import ParkAdvice from './pages/ParkAdvice'

// Legacy pages still used for resort hierarchy (will be removed in a later phase)
import ResortDetail from './pages/ResortDetail'
import VenueList from './pages/VenueList'
import VenueMenu from './pages/VenueMenu'

export default function App() {
  return (
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
        <Route path="/insulin" element={<InsulinHelper />} />
        <Route path="/packing" element={<PackingList />} />
        <Route path="/guide" element={<DiabetesGuide />} />
        <Route path="/advice" element={<ParkAdvice />} />

        {/* Legacy resort routes — kept for backward compatibility */}
        <Route path="/resort/:resortId" element={<ResortDetail />} />
        <Route path="/resort/:resortId/:categoryId" element={<VenueList />} />
        <Route path="/resort/:resortId/:categoryId/:parkId" element={<VenueMenu />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

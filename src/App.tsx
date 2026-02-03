import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import ResortDetail from './pages/ResortDetail'
import VenueList from './pages/VenueList'
import VenueMenu from './pages/VenueMenu'
import Favorites from './pages/Favorites'
import MoreMenu from './pages/MoreMenu'
import InsulinHelper from './pages/InsulinHelper'
import PackingList from './pages/PackingList'
import DiabetesGuide from './pages/DiabetesGuide'
import ParkAdvice from './pages/ParkAdvice'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/resort/:resortId" element={<ResortDetail />} />
        <Route path="/resort/:resortId/:categoryId" element={<VenueList />} />
        <Route path="/resort/:resortId/:categoryId/:parkId" element={<VenueMenu />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/more" element={<MoreMenu />} />
        <Route path="/insulin" element={<InsulinHelper />} />
        <Route path="/packing" element={<PackingList />} />
        <Route path="/guide" element={<DiabetesGuide />} />
        <Route path="/advice" element={<ParkAdvice />} />
      </Route>
    </Routes>
  )
}

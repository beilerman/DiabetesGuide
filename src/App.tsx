import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import Park from './pages/Park'
import InsulinHelper from './pages/InsulinHelper'
import PackingList from './pages/PackingList'
import DiabetesGuide from './pages/DiabetesGuide'
import ParkAdvice from './pages/ParkAdvice'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/park/:id" element={<Park />} />
        <Route path="/insulin" element={<InsulinHelper />} />
        <Route path="/packing" element={<PackingList />} />
        <Route path="/guide" element={<DiabetesGuide />} />
        <Route path="/advice" element={<ParkAdvice />} />
      </Route>
    </Routes>
  )
}

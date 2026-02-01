import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { MealCart } from '../meal-tracker/MealCart'

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <MealCart />
    </div>
  )
}

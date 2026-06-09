import { useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { OfflineBanner } from './OfflineBanner'
import { PageMeta } from './PageMeta'
import { useMealCart } from '../../hooks/useMealCart'
import { ComparisonTray } from '../compare/ComparisonTray'
import { ComparisonModal } from '../compare/ComparisonModal'
import { useCompare } from '../../hooks/useCompare'
import { SkipLinks } from '../SkipLinks'
import { buildInfo, formatBuildDate } from '../../lib/build-info'

export function Layout() {
  const location = useLocation()
  const { totalItemCount } = useMealCart()
  const { compareCount, compareItems } = useCompare()
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [dismissedCompareKey, setDismissedCompareKey] = useState<string | null>(null)
  const showCompareTray = location.pathname.startsWith('/browse') || location.pathname.startsWith('/item/')
  const compareKey = compareItems.map(item => item.id).join('|')
  const compareTrayVisible = showCompareTray && compareCount > 0 && compareKey !== dismissedCompareKey

  return (
    <div className="min-h-screen overflow-x-hidden bg-stone-50">
      <PageMeta />
      <SkipLinks />
      <Header />
      <OfflineBanner />
      <div className="md:pl-20 lg:pl-60">
        <main id="main-content" className={`mx-auto max-w-[96rem] overflow-x-hidden px-4 py-6 md:px-6 md:pb-6 lg:px-8 ${compareTrayVisible ? 'pb-40' : 'pb-24'}`}>
          <Outlet />
        </main>

        <footer className="mx-auto max-w-[96rem] px-4 pb-28 pt-6 text-xs text-stone-500 md:px-6 md:pb-8 lg:px-8">
          <div className="border-t border-stone-200 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              DiabetesGuide {buildInfo.version} - Catalog updated: {formatBuildDate(buildInfo.catalogSnapshotDate)} - educational nutrition planning for theme park visits.
            </p>
            <p>
              <Link to="/about" className="font-medium text-stone-700 hover:text-teal-700">About</Link>
              <span className="mx-2">|</span>
              <Link to="/data-sources" className="font-medium text-stone-700 hover:text-teal-700">Data Sources</Link>
              <span className="mx-2">|</span>
              <Link to="/changelog" className="font-medium text-stone-700 hover:text-teal-700">Changelog</Link>
              <span className="mx-2">|</span>
              <Link to="/privacy" className="font-medium text-stone-700 hover:text-teal-700">Privacy</Link>
              <span className="mx-2">|</span>
              <Link to="/contact" className="font-medium text-stone-700 hover:text-teal-700">Contact</Link>
            </p>
          </div>
        </footer>
      </div>

      {compareTrayVisible && (
        <ComparisonTray
          onOpenModal={() => setShowCompareModal(true)}
          onDismiss={() => setDismissedCompareKey(compareKey)}
        />
      )}
      {showCompareModal && <ComparisonModal onClose={() => setShowCompareModal(false)} />}

      <BottomNav totalItemCount={totalItemCount} />
    </div>
  )
}

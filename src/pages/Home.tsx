import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useParks, useMenuItemCounts } from '../lib/queries'
import { getThemeForResort, DEFAULT_THEME } from '../lib/park-themes'
import { buildBrowsePresetUrl } from '../lib/browse-url'
import { useFavorites } from '../hooks/useFavorites'
import {
  buildHomeResortGroups,
  hasUsableHomeItemCounts,
  type HomeResortCategoryGroup,
  type HomeResortGroup,
} from '../lib/home-resort-groups'

type IconName =
  | 'castle'
  | 'globe'
  | 'hotel'
  | 'map'
  | 'mountain'
  | 'park'
  | 'plate'
  | 'search'
  | 'ship'
  | 'sparkles'
  | 'waves'

const ICON_PATHS: Record<IconName, string[]> = {
  castle: ['M5 21V9l3 2 4-5 4 5 3-2v12', 'M9 21v-5a3 3 0 016 0v5', 'M4 9V5m16 4V5M10 8V4m4 4V4'],
  globe: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18'],
  hotel: ['M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16', 'M16 9h2a2 2 0 012 2v10M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01'],
  map: ['M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z', 'M9 3v15M15 6v15'],
  mountain: ['M3 20h18L14 6l-4 8-2-4-5 10z'],
  park: ['M4 18c3-8 13-8 16 0', 'M6 18a6 6 0 0112 0', 'M12 4v14M8 7h8'],
  plate: ['M12 5a7 7 0 100 14 7 7 0 000-14z', 'M12 9a3 3 0 100 6 3 3 0 000-6z', 'M4 4l4 4M20 4l-4 4'],
  search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M20 20l-4-4'],
  ship: ['M4 15l2-7h12l2 7', 'M3 16c2 3 4 3 6 1 2 2 4 2 6 0 2 2 4 2 6-1M9 8V4h6v4'],
  sparkles: ['M12 3l1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3z', 'M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z'],
  waves: ['M3 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0M3 11c2 2 4 2 6 0s4-2 6 0 4 2 6 0'],
}

const RESORT_ICONS: Record<string, IconName> = {
  wdw: 'castle',
  disneyland: 'sparkles',
  'universal-orlando': 'globe',
  seaworld: 'waves',
  dollywood: 'mountain',
  'kings-island': 'park',
  cruise: 'ship',
  aulani: 'waves',
  festivals: 'sparkles',
  other: 'map',
}

const CATEGORY_ICONS: Record<string, IconName> = {
  'theme-parks': 'park',
  'theme-park': 'park',
  'water-parks': 'waves',
  hotels: 'hotel',
  'resort-hotels': 'hotel',
  'disney-springs': 'plate',
  'downtown-disney': 'plate',
  citywalk: 'plate',
  seasonal: 'sparkles',
  parks: 'park',
  ships: 'ship',
  dining: 'plate',
  destinations: 'map',
}

const PRESET_LINKS = [
  { label: 'Low carb', href: buildBrowsePresetUrl('low-carb'), detail: '30g carbs or less' },
  { label: 'Top rated', href: buildBrowsePresetUrl('top-rated'), detail: 'A/B grade choices' },
  { label: 'Gluten-free', href: buildBrowsePresetUrl('gluten-free'), detail: 'Hide wheat allergens' },
  { label: 'Vegetarian', href: buildBrowsePresetUrl('vegetarian'), detail: 'Plant-forward picks' },
  { label: 'No fried', href: buildBrowsePresetUrl('no-fried'), detail: 'Avoid fried items' },
]

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-stone-200" />
      <div className="mt-3 h-4 w-1/2 rounded bg-stone-200" />
      <div className="mt-5 h-12 rounded-lg bg-stone-100" />
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const { favorites } = useFavorites()
  const { data: parks, isLoading, error } = useParks()
  const { data: menuItemCounts } = useMenuItemCounts()
  const countsReady = hasUsableHomeItemCounts(menuItemCounts)

  const resortGroups = useMemo(() => {
    if (!parks) return []
    return buildHomeResortGroups(parks, menuItemCounts)
  }, [parks, menuItemCounts])

  const totalLocationCount = resortGroups.reduce((sum, group) => sum + group.locationCount, 0)
  const totalItemCount = resortGroups.reduce((sum, group) => sum + group.itemCount, 0)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchQuery.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 py-2 sm:py-3" aria-labelledby="home-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <BrandMark />
            </div>
            <div>
              <h1 id="home-title" className="text-3xl font-bold text-stone-900 sm:text-4xl">DiabetesGuide</h1>
              <p className="mt-1 text-sm text-stone-600 sm:text-base">
                Theme-park nutrition planning for diabetes.
              </p>
            </div>
          </div>
          {countsReady && (
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600">
              Catalog preview: {totalItemCount.toLocaleString()} menu items across {totalLocationCount} locations
            </div>
          )}
        </div>

        <div className="max-w-3xl space-y-3">
          <p className="text-base text-stone-700 sm:text-lg">
            For Type 1 and Type 2 travelers - carb counts, nutrition confidence, and meal planning before you reach the queue.
          </p>
          <form role="search" onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="home-menu-search">Search all menu items</label>
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <input
                id="home-menu-search"
                type="search"
                aria-label="Search all menu items"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search chicken, churro, Dole Whip..."
                className="h-12 w-full rounded-xl border border-stone-300 bg-white pl-10 pr-3 text-base text-stone-900 placeholder-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
            <button
              type="submit"
              className="h-12 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              Search
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Common browse filters">
          {PRESET_LINKS.map(link => (
            <Link
              key={link.label}
              to={link.href}
              className="group rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:border-teal-400 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              title={link.detail}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/insulin"
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:border-amber-400 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Carb &amp; correction estimator
          </Link>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Not medical advice - nutrition can be estimated or unavailable. Confirm dosing decisions with your care team.
          </p>
          <Link to="/data-sources" className="font-bold text-amber-950 underline decoration-amber-500 underline-offset-2">
            Data Sources
          </Link>
        </div>

        {favorites.size > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-950 sm:flex-row sm:items-center sm:justify-between">
            <p>You have {favorites.size} saved favorite{favorites.size === 1 ? '' : 's'} ready for trip planning.</p>
            <Link to="/plan" className="font-bold text-teal-900 underline decoration-teal-500 underline-offset-2">
              Saved favorites
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="destination-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="destination-heading" className="text-2xl font-bold text-stone-900">Choose a Destination</h2>
            <p className="mt-1 text-sm text-stone-600">Browse by resort, then park, hotel, land, restaurant, and menu.</p>
          </div>
          <Link
            to="/browse"
            className="inline-flex w-fit rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:border-teal-300 hover:text-teal-700"
          >
            View all destinations
          </Link>
        </div>

        {!isLoading && !error && resortGroups.length > 0 && (
          <nav
            aria-label="Jump to destination groups"
            className="sticky top-16 z-30 -mx-4 border-y border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur"
          >
            <div className="flex gap-2 overflow-x-auto pb-1">
              {resortGroups.map(group => (
                <a
                  key={group.id}
                  href={`#home-resort-${group.id}`}
                  className="whitespace-nowrap rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:border-teal-300 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  {group.name}
                </a>
              ))}
            </div>
          </nav>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">Failed to load parks</h3>
            <p className="text-stone-600 mb-4">There was an error loading the data. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && resortGroups.length > 0 && (
          <div className="space-y-6">
            {resortGroups.map(group => (
              <ResortDestinationSection
                key={group.id}
                group={group}
                countsReady={countsReady}
              />
            ))}
          </div>
        )}

        {!isLoading && !error && resortGroups.length === 0 && (
          <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
            <h3 className="font-semibold text-stone-900">No destinations found</h3>
            <p className="mt-1 text-sm text-stone-600">Try browsing all menu items instead.</p>
            <Link
              to="/browse"
              className="mt-4 inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Browse all
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}

function formatItems(count: number, countsReady: boolean): string {
  if (!countsReady) return 'Counts syncing'
  return `${count.toLocaleString()} ${count === 1 ? 'menu item' : 'menu items'}`
}

function formatLocations(count: number): string {
  return `${count} ${count === 1 ? 'location' : 'locations'}`
}

function formatGroupStats(group: HomeResortGroup, countsReady: boolean): string {
  if (!countsReady) return `${formatLocations(group.locationCount)} with counts syncing`
  return `${formatItems(group.itemCount, countsReady)} across ${formatLocations(group.locationCount)}`
}

function resortHref(group: HomeResortGroup): string {
  return group.id === 'other' ? '/browse' : `/resort/${group.id}`
}

function categoryHref(group: HomeResortGroup, category: HomeResortCategoryGroup): string {
  return group.id === 'other' ? '/browse' : `/resort/${group.id}/${category.id}`
}

function venuePreview(category: HomeResortCategoryGroup): string {
  const visible = category.parks.slice(0, 3).map(park => park.name)
  const remaining = category.parks.length - visible.length
  return `${visible.join(', ')}${remaining > 0 ? ` + ${remaining} more` : ''}`
}

function resortContext(group: HomeResortGroup): string {
  const context: Record<string, string> = {
    wdw: 'Parks, water parks, hotels, Disney Springs, and festivals around Orlando.',
    disneyland: 'Theme parks, resort hotels, and Downtown Disney in Anaheim.',
    'universal-orlando': 'Theme parks, Volcano Bay, CityWalk, and Universal resort hotels.',
    cruise: 'Ships sailing globally with onboard dining records.',
    seaworld: 'SeaWorld Orlando and Busch Gardens Tampa dining in one place.',
    aulani: 'Resort dining at Ko Olina, Hawaii.',
    dollywood: 'Dining across Dollywood lands in Pigeon Forge.',
    'kings-island': 'Dining across Kings Island in Mason, Ohio.',
    other: 'Supplemental and unmatched destination records grouped for all-parks browsing.',
  }

  return context[group.id] ?? group.location
}

function ResortDestinationSection({
  group,
  countsReady,
}: {
  group: HomeResortGroup
  countsReady: boolean
}) {
  const theme = group.id === 'other' ? DEFAULT_THEME : getThemeForResort(group.id)

  return (
    <section
      aria-labelledby={`home-resort-${group.id}`}
      className="scroll-mt-32 border-t border-stone-200 pt-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: theme.primary }}
            aria-hidden="true"
          >
            <Icon name={RESORT_ICONS[group.id] ?? 'map'} className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 id={`home-resort-${group.id}`} className="text-xl font-bold text-stone-900">
              {group.name}
            </h3>
            <p className="text-sm text-stone-600">{resortContext(group)}</p>
            <p className="mt-1 text-xs font-semibold text-stone-500">
              {formatGroupStats(group, countsReady)}
            </p>
          </div>
        </div>

        <Link
          to={resortHref(group)}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:border-teal-300 hover:text-teal-700"
        >
          Browse {group.name}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {group.categories.map(category => (
          <Link
            key={category.id}
            to={categoryHref(group, category)}
            className="group flex min-h-24 gap-3 rounded-lg border border-stone-200 bg-white p-3 transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            style={{ borderLeftColor: theme.primary, borderLeftWidth: 4 }}
          >
            <span
              className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: theme.primary }}
              aria-hidden="true"
            >
              <Icon name={CATEGORY_ICONS[category.id] ?? RESORT_ICONS[group.id] ?? 'map'} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-stone-900 group-hover:text-teal-800">{category.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-stone-500">
                {formatItems(category.itemCount, countsReady)} | {formatLocations(category.locationCount)}
              </span>
              {category.parks.length > 0 && (
                <span className="mt-1 block truncate text-xs text-stone-500" title={venuePreview(category)}>
                  {venuePreview(category)}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function BrandMark() {
  return (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 13.5h8" strokeLinecap="round" />
      <path d="M9 10.5c1.6-1.7 4.4-1.7 6 0" strokeLinecap="round" />
      <path d="M12 5.5v3" strokeLinecap="round" />
      <path d="M7 17h10" strokeLinecap="round" />
    </svg>
  )
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name].map(path => (
        <path key={path} d={path} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

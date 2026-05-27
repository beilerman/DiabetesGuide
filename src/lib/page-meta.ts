const SITE_ORIGIN = 'https://diabetesguide.app'

export interface PageMeta {
  title: string
  description: string
  canonicalPath: string
}

const DEFAULT_META: PageMeta = {
  title: 'DiabetesGuide - Theme Park Food Nutrition',
  description: 'Find diabetes-friendly theme park food with carb, calorie, nutrition, and trip planning tools.',
  canonicalPath: '/',
}

const ROUTE_META: Array<{ match: (pathname: string) => boolean; meta: PageMeta }> = [
  {
    match: pathname => pathname === '/',
    meta: {
      title: 'DiabetesGuide - Theme Park Diabetes Food Guide',
      description: 'Browse diabetes-aware nutrition information by resort, park, hotel, land, and restaurant.',
      canonicalPath: '/',
    },
  },
  {
    match: pathname => pathname.startsWith('/browse'),
    meta: {
      title: 'Browse Theme Park Menus - DiabetesGuide',
      description: 'Browse theme park menu items by location with carbs, calories, confidence warnings, and restaurant grouping.',
      canonicalPath: '/browse',
    },
  },
  {
    match: pathname => pathname.startsWith('/search'),
    meta: {
      title: 'Search Theme Park Food - DiabetesGuide',
      description: 'Search theme park menu items across supported parks, hotels, and restaurants.',
      canonicalPath: '/search',
    },
  },
  {
    match: pathname => pathname.startsWith('/item/'),
    meta: {
      title: 'Menu Item Details - DiabetesGuide',
      description: 'Review nutrition details, confidence level, allergen notes, and diabetes-specific context for a menu item.',
      canonicalPath: '/item',
    },
  },
  {
    match: pathname => pathname.startsWith('/meal'),
    meta: {
      title: 'Meal Carb Planner - DiabetesGuide',
      description: 'Build a local meal list and estimate total carbs from selected theme park menu items.',
      canonicalPath: '/meal',
    },
  },
  {
    match: pathname => pathname.startsWith('/insulin'),
    meta: {
      title: 'Carb & Correction Estimator - DiabetesGuide',
      description: 'Educational carb and correction estimator with low-glucose blocking, input guardrails, and IOB handling.',
      canonicalPath: '/insulin',
    },
  },
  {
    match: pathname => pathname.startsWith('/plan') || pathname.startsWith('/favorites'),
    meta: {
      title: 'Trip Plan - DiabetesGuide',
      description: 'Review saved favorites and organize theme park food picks for a trip.',
      canonicalPath: '/plan',
    },
  },
  {
    match: pathname => pathname.startsWith('/packing'),
    meta: {
      title: 'Diabetes Packing Checklist - DiabetesGuide',
      description: 'Plan diabetes supplies for theme park days with a local packing checklist.',
      canonicalPath: '/packing',
    },
  },
  {
    match: pathname => pathname.startsWith('/guide'),
    meta: {
      title: 'Diabetes Park Guide - DiabetesGuide',
      description: 'Educational guidance for managing diabetes during theme park visits.',
      canonicalPath: '/guide',
    },
  },
  {
    match: pathname => pathname.startsWith('/advice') || pathname.startsWith('/tips'),
    meta: {
      title: 'Park Day Tips - DiabetesGuide',
      description: 'Theme park day advice for hydration, heat, walking, supplies, and glucose planning.',
      canonicalPath: '/advice',
    },
  },
  {
    match: pathname => pathname.startsWith('/methodology'),
    meta: {
      title: 'Nutrition Data Sources - DiabetesGuide',
      description: 'How DiabetesGuide sources, estimates, flags, and audits theme park nutrition data.',
      canonicalPath: '/methodology',
    },
  },
  {
    match: pathname => pathname.startsWith('/data-sources'),
    meta: {
      title: 'Nutrition Data Sources - DiabetesGuide',
      description: 'How DiabetesGuide sources, estimates, flags, and audits theme park nutrition data.',
      canonicalPath: '/data-sources',
    },
  },
  {
    match: pathname => pathname.startsWith('/about'),
    meta: {
      title: 'About - DiabetesGuide',
      description: 'About DiabetesGuide, an independent educational theme park diabetes food planning tool.',
      canonicalPath: '/about',
    },
  },
  {
    match: pathname => pathname.startsWith('/contact'),
    meta: {
      title: 'Contact - DiabetesGuide',
      description: 'Contact DiabetesGuide for nutrition corrections, broken links, accessibility issues, and menu updates.',
      canonicalPath: '/contact',
    },
  },
  {
    match: pathname => pathname.startsWith('/changelog'),
    meta: {
      title: 'Changelog - DiabetesGuide',
      description: 'Review recent DiabetesGuide app, accessibility, and catalog-quality changes.',
      canonicalPath: '/changelog',
    },
  },
  {
    match: pathname => pathname.startsWith('/privacy'),
    meta: {
      title: 'Privacy - DiabetesGuide',
      description: 'Privacy information for DiabetesGuide local app data and contact links.',
      canonicalPath: '/privacy',
    },
  },
  {
    match: pathname => pathname.startsWith('/settings') || pathname.startsWith('/more'),
    meta: {
      title: 'Settings and More - DiabetesGuide',
      description: 'Manage app preferences, accessibility settings, data sources, and support links.',
      canonicalPath: '/more',
    },
  },
  {
    match: pathname => pathname.startsWith('/park/') || pathname.startsWith('/resort/'),
    meta: {
      title: 'Destination Menus - DiabetesGuide',
      description: 'Browse supported destination menus by park, resort, hotel, land, and restaurant.',
      canonicalPath: '/browse',
    },
  },
]

function getMetaElement(selector: string, create: () => HTMLMetaElement): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  if (existing) return existing
  const element = create()
  document.head.appendChild(element)
  return element
}

function setNamedMeta(name: string, content: string): void {
  const element = getMetaElement(`meta[name="${name}"]`, () => {
    const meta = document.createElement('meta')
    meta.name = name
    return meta
  })
  element.content = content
}

function setPropertyMeta(property: string, content: string): void {
  const element = getMetaElement(`meta[property="${property}"]`, () => {
    const meta = document.createElement('meta')
    meta.setAttribute('property', property)
    return meta
  })
  element.content = content
}

function setCanonical(pathname: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }
  link.href = `${SITE_ORIGIN}${pathname}`
}

export function getPageMeta(pathname: string): PageMeta {
  const normalizedPath = pathname || '/'
  return ROUTE_META.find(route => route.match(normalizedPath))?.meta ??
    {
      title: 'Page Not Found - DiabetesGuide',
      description: DEFAULT_META.description,
      canonicalPath: '/404',
    }
}

export function applyPageMeta(meta: PageMeta): void {
  document.title = meta.title
  setNamedMeta('description', meta.description)
  setPropertyMeta('og:title', meta.title)
  setPropertyMeta('og:description', meta.description)
  setPropertyMeta('og:url', `${SITE_ORIGIN}${meta.canonicalPath}`)
  setNamedMeta('twitter:title', meta.title)
  setNamedMeta('twitter:description', meta.description)
  setCanonical(meta.canonicalPath)
}

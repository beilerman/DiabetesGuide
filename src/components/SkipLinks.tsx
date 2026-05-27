import { useLocation } from 'react-router-dom'
import type { MouseEvent } from 'react'

interface SkipLink {
  href: `#${string}`
  label: string
}

export function SkipLinks() {
  const { pathname } = useLocation()
  const links = getSkipLinks(pathname)

  return (
    <div aria-label="Skip links">
      {links.map(link => (
        <a
          key={link.href}
          href={link.href}
          className="skip-link"
          onClick={event => focusSkipTarget(event, link.href)}
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}

function getSkipLinks(pathname: string): SkipLink[] {
  const links: SkipLink[] = []

  if (pathname.startsWith('/search')) {
    links.push(
      { href: '#site-search', label: 'Skip to search' },
      { href: '#search-results', label: 'Skip to results' },
    )
  } else if (pathname.startsWith('/browse')) {
    links.push(
      { href: '#browse-filter-search', label: 'Skip to search' },
      { href: '#browse-results', label: 'Skip to results' },
    )
  }

  links.push({ href: '#main-content', label: 'Skip to main content' })
  return links
}

function focusSkipTarget(event: MouseEvent<HTMLAnchorElement>, href: `#${string}`) {
  const target = document.getElementById(href.slice(1))
  if (!target) return

  event.preventDefault()
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start' })
  window.history.replaceState(null, '', href)
}

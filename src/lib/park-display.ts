import { cleanDisplayText } from './display'
import type { Park } from './types'

export function canonicalParkKey(name: string | null | undefined): string {
  return cleanDisplayText(name)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2019']s\b/g, '')
    .replace(/[\u2019']/g, '')
    .replace(/\buniversals\b/g, 'universal')
    .replace(/\bdisneys\b/g, 'disney')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function dedupeParksForDisplay(parks: Park[]): Park[] {
  const byKey = new Map<string, Park>()
  for (const park of parks) {
    const key = canonicalParkKey(park.name)
    const current = byKey.get(key)
    if (!current || park.name.length < current.name.length) {
      byKey.set(key, park)
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function getCanonicalParkName(park: Park | undefined): string {
  if (!park) return 'Unknown Destination'
  const key = canonicalParkKey(park.name)
  if (key === 'universal epic universe') return 'Universal Epic Universe'
  if (key === 'universal volcano bay') return 'Universal Volcano Bay'
  return cleanDisplayText(park.name) || park.name
}

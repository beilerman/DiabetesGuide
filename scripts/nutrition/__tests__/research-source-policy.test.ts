import { describe, expect, it } from 'vitest'

import {
  hostnameMatchesDomain,
  resolveAndValidateSource,
  validateSourceOwnership,
  type FirstPartySourcePolicy,
} from '../research-source-policy.js'

const policy: FirstPartySourcePolicy = {
  schemaVersion: 1,
  owners: {
    disney: {
      type: 'destination',
      displayName: 'Disney',
      domains: ['disney.go.com', 'cdn1.parksmedia.wdprapps.disney.com'],
      venuePatterns: [],
    },
    starbucks: {
      type: 'chain',
      displayName: 'Starbucks',
      domains: ['starbucks.com'],
      venuePatterns: ['starbucks'],
    },
    example_manufacturer: {
      type: 'manufacturer',
      displayName: 'Example Foods',
      domains: ['examplefoods.com'],
      venuePatterns: [],
    },
  },
}

describe('hostnameMatchesDomain', () => {
  it('accepts exact hosts and true subdomains only', () => {
    expect(hostnameMatchesDomain('disney.go.com', 'disney.go.com')).toBe(true)
    expect(hostnameMatchesDomain('disneyworld.disney.go.com', 'disney.go.com')).toBe(true)
    expect(hostnameMatchesDomain('disney.go.com.example.com', 'disney.go.com')).toBe(false)
    expect(hostnameMatchesDomain('notdisney.go.com', 'disney.go.com')).toBe(false)
  })
})

describe('validateSourceOwnership', () => {
  it('allows confirmed Disney web and document hosts', () => {
    expect(validateSourceOwnership({
      sourceUrl: 'https://disneyworld.disney.go.com/dining/example/menus/',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      venueName: 'Example at Magic Kingdom',
      manufacturerRelationship: null,
    }, policy)).toMatchObject({ valid: true, reviewRequired: false })
    expect(validateSourceOwnership({
      sourceUrl: 'https://cdn1.parksmedia.wdprapps.disney.com/menu.pdf',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      venueName: 'Example at EPCOT',
      manufacturerRelationship: null,
    }, policy)).toMatchObject({ valid: true })
  })

  it('requires a chain source to match the named catalog venue', () => {
    expect(validateSourceOwnership({
      sourceUrl: 'https://www.starbucks.com/menu/product',
      ownerId: 'starbucks',
      sourceOwnerType: 'chain',
      venueName: 'Starbucks at Disney Springs',
      manufacturerRelationship: null,
    }, policy)).toMatchObject({ valid: true })
    expect(validateSourceOwnership({
      sourceUrl: 'https://www.starbucks.com/menu/product',
      ownerId: 'starbucks',
      sourceOwnerType: 'chain',
      venueName: 'Main Street Bakery',
      manufacturerRelationship: null,
    }, policy)).toMatchObject({ valid: false, reason: 'owner_venue_mismatch' })
  })

  it('requires an explicit manufacturer relationship', () => {
    expect(validateSourceOwnership({
      sourceUrl: 'https://nutrition.examplefoods.com/item',
      ownerId: 'example_manufacturer',
      sourceOwnerType: 'manufacturer',
      venueName: 'Snack Cart',
      manufacturerRelationship: 'Packaged item manufactured by Example Foods',
    }, policy)).toMatchObject({ valid: true })
    expect(validateSourceOwnership({
      sourceUrl: 'https://nutrition.examplefoods.com/item',
      ownerId: 'example_manufacturer',
      sourceOwnerType: 'manufacturer',
      venueName: 'Snack Cart',
      manufacturerRelationship: null,
    }, policy)).toMatchObject({ valid: false, reason: 'manufacturer_relationship_missing' })
  })

  it.each([
    'https://disney.go.com.example.com/menu',
    'https://myfitnesspal.com/food',
    'https://allears.net/dining/menu',
    'https://bit.ly/example',
    'http://disneyworld.disney.go.com/menu',
  ])('rejects non-owned, shortened, or insecure URL %s', sourceUrl => {
    expect(validateSourceOwnership({
      sourceUrl,
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      venueName: 'Magic Kingdom Cart',
      manufacturerRelationship: null,
    }, policy).valid).toBe(false)
  })

  it('flags an unknown owner for review', () => {
    expect(validateSourceOwnership({
      sourceUrl: 'https://unknown.example/menu',
      ownerId: 'unknown',
      sourceOwnerType: 'chain',
      venueName: 'Unknown Venue',
      manufacturerRelationship: null,
    }, policy)).toEqual({ valid: false, reviewRequired: true, reason: 'owner_unverified' })
  })
})

describe('resolveAndValidateSource', () => {
  it('rejects a first-party URL that redirects to a third party', async () => {
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString()
      if (url.includes('disneyworld')) {
        return new Response(null, { status: 302, headers: { location: 'https://example.org/blog' } })
      }
      return new Response('third party', { status: 200 })
    }
    await expect(resolveAndValidateSource({
      sourceUrl: 'https://disneyworld.disney.go.com/menu',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      venueName: 'Magic Kingdom Cart',
      manufacturerRelationship: null,
    }, { policy, fetcher })).resolves.toMatchObject({
      valid: false,
      reason: 'domain_not_owned',
      finalUrl: 'https://example.org/blog',
    })
  })

  it('captures final URL, retrieval metadata, and a content hash', async () => {
    const fetcher = async (): Promise<Response> => new Response('Total Carbohydrate 42 g', {
      status: 200,
      headers: { etag: 'menu-v1', 'last-modified': 'Sun, 12 Jul 2026 12:00:00 GMT' },
    })
    const result = await resolveAndValidateSource({
      sourceUrl: 'https://disneyworld.disney.go.com/menu',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      venueName: 'Magic Kingdom Cart',
      manufacturerRelationship: null,
    }, {
      policy,
      fetcher,
      now: () => '2026-07-12T12:01:00.000Z',
      sleep: async () => undefined,
    })
    expect(result).toMatchObject({
      valid: true,
      finalUrl: 'https://disneyworld.disney.go.com/menu',
      etag: 'menu-v1',
      lastModified: 'Sun, 12 Jul 2026 12:00:00 GMT',
      retrievedAt: '2026-07-12T12:01:00.000Z',
    })
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result).not.toHaveProperty('body')
  })

  it('uses at most three attempts for retryable responses', async () => {
    let attempts = 0
    const result = await resolveAndValidateSource({
      sourceUrl: 'https://disneyworld.disney.go.com/menu',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      venueName: 'Magic Kingdom Cart',
      manufacturerRelationship: null,
    }, {
      policy,
      fetcher: async () => {
        attempts += 1
        return new Response('unavailable', { status: 503 })
      },
      sleep: async () => undefined,
    })
    expect(attempts).toBe(3)
    expect(result).toMatchObject({ valid: false, reason: 'source_unavailable' })
  })
})

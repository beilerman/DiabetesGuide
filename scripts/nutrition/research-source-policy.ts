import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { rootPath } from '../audit/utils.js'

export type SourceOwnerType = 'destination' | 'chain' | 'manufacturer'

export interface FirstPartySourceOwner {
  type: SourceOwnerType
  displayName: string
  domains: string[]
  venuePatterns: string[]
}

export interface FirstPartySourcePolicy {
  schemaVersion: 1
  owners: Record<string, FirstPartySourceOwner>
}

export interface SourceOwnershipInput {
  sourceUrl: string
  ownerId: string
  sourceOwnerType: SourceOwnerType
  venueName: string
  manufacturerRelationship: string | null
}

export interface SourceOwnershipResult {
  valid: boolean
  reviewRequired: boolean
  reason?: string
}

export interface ResolvedSource extends SourceOwnershipResult {
  finalUrl: string
  retrievedAt?: string
  contentHash?: string
  etag?: string | null
  lastModified?: string | null
  status?: number
}

export type ResearchSourceFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface ResolveSourceOptions {
  policy?: FirstPartySourcePolicy
  fetcher?: ResearchSourceFetcher
  now?: () => string
  sleep?: (milliseconds: number) => Promise<void>
}

const MAX_REDIRECTS = 5
const MAX_ATTEMPTS = 3
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '')
  const normalizedDomain = domain.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`)
}

function isOwner(value: unknown): value is FirstPartySourceOwner {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const owner = value as Record<string, unknown>
  return (owner.type === 'destination' || owner.type === 'chain' || owner.type === 'manufacturer')
    && typeof owner.displayName === 'string'
    && Array.isArray(owner.domains)
    && owner.domains.every(domain => typeof domain === 'string' && domain.trim() !== '')
    && Array.isArray(owner.venuePatterns)
    && owner.venuePatterns.every(pattern => typeof pattern === 'string' && pattern.trim() !== '')
}

export function loadFirstPartySourcePolicy(
  path = rootPath('data', 'nutrition', 'first-party-source-policy.json'),
): FirstPartySourcePolicy {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('First-party source policy must be an object')
  }
  const policy = parsed as Record<string, unknown>
  if (policy.schemaVersion !== 1 || policy.owners == null || typeof policy.owners !== 'object' || Array.isArray(policy.owners)) {
    throw new Error('First-party source policy schema is invalid')
  }
  if (!Object.values(policy.owners).every(isOwner)) throw new Error('First-party source policy owner is invalid')
  return parsed as FirstPartySourcePolicy
}

export function validateSourceOwnership(
  input: SourceOwnershipInput,
  policy: FirstPartySourcePolicy = loadFirstPartySourcePolicy(),
): SourceOwnershipResult {
  const owner = policy.owners[input.ownerId]
  if (!owner) return { valid: false, reviewRequired: true, reason: 'owner_unverified' }
  if (owner.type !== input.sourceOwnerType) {
    return { valid: false, reviewRequired: true, reason: 'owner_type_mismatch' }
  }

  let source: URL
  try {
    source = new URL(input.sourceUrl)
  } catch {
    return { valid: false, reviewRequired: true, reason: 'invalid_url' }
  }
  if (source.protocol !== 'https:') {
    return { valid: false, reviewRequired: true, reason: 'insecure_url' }
  }
  if (!owner.domains.some(domain => hostnameMatchesDomain(source.hostname, domain))) {
    return { valid: false, reviewRequired: true, reason: 'domain_not_owned' }
  }

  if (owner.type === 'chain') {
    const venue = input.venueName.toLowerCase()
    if (!owner.venuePatterns.some(pattern => venue.includes(pattern.toLowerCase()))) {
      return { valid: false, reviewRequired: true, reason: 'owner_venue_mismatch' }
    }
  }
  if (owner.type === 'manufacturer') {
    const relationship = input.manufacturerRelationship?.toLowerCase() ?? ''
    if (!relationship.includes(owner.displayName.toLowerCase())) {
      return { valid: false, reviewRequired: true, reason: 'manufacturer_relationship_missing' }
    }
  }
  return { valid: true, reviewRequired: false }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

async function fetchWithRetries(
  url: string,
  fetcher: ResearchSourceFetcher,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<Response> {
  let lastResponse: Response | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'DiabetesGuide-Nutrition-Research/1.0' },
      })
      lastResponse = response
      if (!isRetryable(response.status) || attempt === MAX_ATTEMPTS) return response
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error
    }
    await sleep(250 * 2 ** (attempt - 1))
  }
  if (lastResponse) return lastResponse
  throw new Error('Source request failed without a response')
}

export async function resolveAndValidateSource(
  input: SourceOwnershipInput,
  options: ResolveSourceOptions = {},
): Promise<ResolvedSource> {
  const policy = options.policy ?? loadFirstPartySourcePolicy()
  const fetcher = options.fetcher ?? fetch
  const sleep = options.sleep ?? (milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds)))
  const initial = validateSourceOwnership(input, policy)
  if (!initial.valid) return { ...initial, finalUrl: input.sourceUrl }

  let currentUrl = input.sourceUrl
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response: Response
    try {
      response = await fetchWithRetries(currentUrl, fetcher, sleep)
    } catch {
      return { valid: false, reviewRequired: true, reason: 'source_unavailable', finalUrl: currentUrl }
    }
    if (isRetryable(response.status)) {
      return {
        valid: false,
        reviewRequired: true,
        reason: 'source_unavailable',
        finalUrl: currentUrl,
        status: response.status,
      }
    }
    if (isRedirect(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        return { valid: false, reviewRequired: true, reason: 'redirect_without_location', finalUrl: currentUrl }
      }
      if (redirects === MAX_REDIRECTS) {
        return { valid: false, reviewRequired: true, reason: 'too_many_redirects', finalUrl: currentUrl }
      }
      currentUrl = new URL(location, currentUrl).toString()
      const redirected = validateSourceOwnership({ ...input, sourceUrl: currentUrl }, policy)
      if (!redirected.valid) return { ...redirected, finalUrl: currentUrl }
      continue
    }
    if (!response.ok) {
      return {
        valid: false,
        reviewRequired: true,
        reason: 'invalid_response',
        finalUrl: currentUrl,
        status: response.status,
      }
    }
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      return { valid: false, reviewRequired: true, reason: 'response_too_large', finalUrl: currentUrl }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      return { valid: false, reviewRequired: true, reason: 'response_too_large', finalUrl: currentUrl }
    }
    return {
      valid: true,
      reviewRequired: false,
      finalUrl: currentUrl,
      retrievedAt: (options.now ?? (() => new Date().toISOString()))(),
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      status: response.status,
    }
  }
  return { valid: false, reviewRequired: true, reason: 'too_many_redirects', finalUrl: currentUrl }
}

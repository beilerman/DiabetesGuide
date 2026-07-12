import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'

const LEASE_DURATION_MS = 5.5 * 60 * 60 * 1_000

interface ResearchLeasePayload {
  schemaVersion: 1
  token: string
  pid: number
  hostname: string
  acquiredAt: string
  expiresAt: string
}

export type ResearchLeaseResult =
  | { status: 'acquired'; token: string; acquiredAt: string; expiresAt: string; replacedExpired: boolean }
  | { status: 'busy'; acquiredAt: string; expiresAt: string }

export interface AcquireResearchLeaseOptions {
  home: string
  now?: string
  token?: string
  forceExpired?: boolean
}

export function researchLeasePath(home: string): string {
  const directory = resolve(home, 'nutrition-research')
  mkdirSync(directory, { recursive: true })
  return join(directory, 'worker.lock')
}

function parseLease(contents: string): ResearchLeasePayload | null {
  try {
    const value: unknown = JSON.parse(contents)
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
    const lease = value as Record<string, unknown>
    if (
      lease.schemaVersion !== 1
      || typeof lease.token !== 'string'
      || typeof lease.pid !== 'number'
      || typeof lease.hostname !== 'string'
      || typeof lease.acquiredAt !== 'string'
      || typeof lease.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(lease.acquiredAt))
      || !Number.isFinite(Date.parse(lease.expiresAt))
    ) return null
    return lease as unknown as ResearchLeasePayload
  } catch {
    return null
  }
}

function writeLeaseExclusively(path: string, payload: ResearchLeasePayload): boolean {
  let descriptor: number | null = null
  try {
    descriptor = openSync(path, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(payload)}\n`, 'utf8')
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  } finally {
    if (descriptor != null) closeSync(descriptor)
  }
}

export function acquireResearchLease(options: AcquireResearchLeaseOptions): ResearchLeaseResult {
  const path = researchLeasePath(options.home)
  const now = new Date(options.now ?? new Date().toISOString())
  if (!Number.isFinite(now.getTime())) throw new Error('now must be a valid ISO date')
  const acquiredAt = now.toISOString()
  const payload: ResearchLeasePayload = {
    schemaVersion: 1,
    token: options.token ?? randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    acquiredAt,
    expiresAt: new Date(now.getTime() + LEASE_DURATION_MS).toISOString(),
  }

  if (writeLeaseExclusively(path, payload)) {
    return { status: 'acquired', token: payload.token, acquiredAt, expiresAt: payload.expiresAt, replacedExpired: false }
  }

  const existing = parseLease(readFileSync(path, 'utf8'))
  const invalid = existing == null
  const futureDated = existing != null && Date.parse(existing.acquiredAt) > now.getTime()
  if ((invalid || futureDated) && !options.forceExpired) {
    throw new Error('Lease is malformed or future-dated; use --force-expired only after checking the worker')
  }
  if (existing != null && !futureDated && Date.parse(existing.expiresAt) > now.getTime()) {
    return { status: 'busy', acquiredAt: existing.acquiredAt, expiresAt: existing.expiresAt }
  }

  const tombstone = `${path}.${process.pid}.${randomUUID()}.expired`
  try {
    renameSync(path, tombstone)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    if (!writeLeaseExclusively(path, payload)) {
      const winner = parseLease(readFileSync(path, 'utf8'))
      if (!winner) throw new Error('Another worker acquired an unreadable lease')
      return { status: 'busy', acquiredAt: winner.acquiredAt, expiresAt: winner.expiresAt }
    }
    return { status: 'acquired', token: payload.token, acquiredAt, expiresAt: payload.expiresAt, replacedExpired: true }
  } finally {
    rmSync(tombstone, { force: true })
  }
}

export function releaseResearchLease(options: { home: string; token: string }):
  { status: 'released' | 'absent' | 'not_owner' } {
  const path = researchLeasePath(options.home)
  if (!existsSync(path)) return { status: 'absent' }
  const existing = parseLease(readFileSync(path, 'utf8'))
  if (!existing || existing.token !== options.token) return { status: 'not_owner' }

  const tombstone = `${path}.${process.pid}.${randomUUID()}.released`
  try {
    renameSync(path, tombstone)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' }
    throw error
  }
  rmSync(tombstone, { force: true })
  return { status: 'released' }
}

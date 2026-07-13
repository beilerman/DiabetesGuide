import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  acquireResearchLease,
  releaseResearchLease,
  researchLeasePath,
} from '../research-lease.js'

const NOW = '2026-07-12T12:00:00.000Z'

describe('research worker lease', () => {
  it('allows one owner and reports a second active acquisition as busy', () => {
    const home = mkdtempSync(join(tmpdir(), 'research-lease-'))
    const first = acquireResearchLease({ home, now: NOW, token: 'owner-one' })
    const second = acquireResearchLease({ home, now: NOW, token: 'owner-two' })
    expect(first).toMatchObject({ status: 'acquired', token: 'owner-one' })
    expect(second).toMatchObject({ status: 'busy', acquiredAt: NOW })
    expect(second).not.toHaveProperty('token')
    expect(JSON.parse(readFileSync(researchLeasePath(home), 'utf8'))).toMatchObject({ token: 'owner-one' })
  })

  it('replaces a lease after its five-hour-thirty-minute expiry', () => {
    const home = mkdtempSync(join(tmpdir(), 'research-lease-'))
    acquireResearchLease({ home, now: '2026-07-12T00:00:00.000Z', token: 'expired' })
    const replacement = acquireResearchLease({ home, now: '2026-07-12T05:30:00.001Z', token: 'new' })
    expect(replacement).toMatchObject({ status: 'acquired', token: 'new', replacedExpired: true })
  })

  it('only permits the matching token to release and release is idempotent', () => {
    const home = mkdtempSync(join(tmpdir(), 'research-lease-'))
    acquireResearchLease({ home, now: NOW, token: 'owner' })
    expect(releaseResearchLease({ home, token: 'other' })).toEqual({ status: 'not_owner' })
    expect(existsSync(researchLeasePath(home))).toBe(true)
    expect(releaseResearchLease({ home, token: 'owner' })).toEqual({ status: 'released' })
    expect(releaseResearchLease({ home, token: 'owner' })).toEqual({ status: 'absent' })
  })

  it('fails closed for malformed and future-dated locks unless force recovery is explicit', () => {
    for (const payload of [
      'not-json',
      JSON.stringify({
        schemaVersion: 1,
        token: 'future',
        pid: 1,
        hostname: 'host',
        acquiredAt: '2026-07-13T12:00:00.000Z',
        expiresAt: '2026-07-13T17:30:00.000Z',
      }),
    ]) {
      const home = mkdtempSync(join(tmpdir(), 'research-lease-'))
      const path = researchLeasePath(home)
      writeFileSync(path, payload)
      expect(() => acquireResearchLease({ home, now: NOW, token: 'new' })).toThrow(/force-expired/i)
      expect(acquireResearchLease({
        home,
        now: NOW,
        token: 'new',
        forceExpired: true,
      })).toMatchObject({ status: 'acquired', token: 'new', replacedExpired: true })
    }
  })

  it('has exactly one winner for simultaneous acquisition attempts', async () => {
    const home = mkdtempSync(join(tmpdir(), 'research-lease-'))
    const results = await Promise.all(
      ['one', 'two'].map(token => Promise.resolve().then(() => acquireResearchLease({ home, now: NOW, token }))),
    )
    expect(results.filter(result => result.status === 'acquired')).toHaveLength(1)
    expect(results.filter(result => result.status === 'busy')).toHaveLength(1)
  })
})

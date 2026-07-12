import { describe, expect, it, vi } from 'vitest'
import { resolveSupabaseConfig } from '../utils.js'

describe('resolveSupabaseConfig', () => {
  it('prefers project-local .env.local settings over ambient shell variables, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = resolveSupabaseConfig(
      {
        SUPABASE_URL: 'https://diabetes-guide.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
      },
      {
        SUPABASE_URL: 'https://other-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'ambient-service-role',
      },
    )

    expect(config).toEqual({
      url: 'https://diabetes-guide.supabase.co',
      key: 'local-service-role',
    })
    // A shadowed explicit override must be named, never discarded silently.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('https://other-project.supabase.co'))
    warn.mockRestore()
  })

  it('does not warn when shell and .env.local agree (the documented inline-grep pattern)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveSupabaseConfig(
      { SUPABASE_URL: 'https://diabetes-guide.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
      { SUPABASE_URL: 'https://diabetes-guide.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('never mixes sources: a partial .env.local yields a missing key, not an ambient one', () => {
    const config = resolveSupabaseConfig(
      { VITE_SUPABASE_URL: 'https://diabetes-guide.supabase.co' },
      {
        SUPABASE_URL: 'https://other-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'ambient-service-role',
      },
    )

    // Pairing the local URL with another repo's service key would be a
    // cross-project credential pair — fail closed instead.
    expect(config.url).toBe('https://diabetes-guide.supabase.co')
    expect(config.key).toBeUndefined()
  })

  it('falls back to runtime env vars for CI when no local values exist', () => {
    const config = resolveSupabaseConfig(
      {},
      {
        VITE_SUPABASE_URL: 'https://ci-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'ci-service-role',
      },
    )

    expect(config).toEqual({
      url: 'https://ci-project.supabase.co',
      key: 'ci-service-role',
    })
  })

  it('uses VITE_SUPABASE_URL from .env.local when SUPABASE_URL is absent', () => {
    const config = resolveSupabaseConfig(
      {
        VITE_SUPABASE_URL: 'https://local-vite.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
      },
      {},
    )

    expect(config.url).toBe('https://local-vite.supabase.co')
    expect(config.key).toBe('local-service-role')
  })
})

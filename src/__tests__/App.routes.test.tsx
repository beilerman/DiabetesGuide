import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ComponentType } from 'react'

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key')

let App: ComponentType

beforeAll(async () => {
  App = (await import('../App')).default
})

async function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('public trust routes', () => {
  it.each([
    ['/about', /about diabetesguide/i],
    ['/data-sources', /nutrition data sources/i],
    ['/contact', /contact diabetesguide/i],
    ['/changelog', /changelog/i],
  ])('renders %s instead of the not-found page', async (path, heading) => {
    await renderRoute(path)

    expect(await screen.findByRole('heading', { name: heading }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument()
  })

  it('uses real internal footer routes for trust links', async () => {
    await renderRoute('/about')

    const footer = within(screen.getByRole('contentinfo'))
    expect(await footer.findByRole('link', { name: /^about$/i })).toHaveAttribute('href', '/about')
    expect(footer.getByRole('link', { name: /^data sources$/i })).toHaveAttribute('href', '/data-sources')
    expect(footer.getByRole('link', { name: /^changelog$/i })).toHaveAttribute('href', '/changelog')
    expect(footer.getByRole('link', { name: /^contact$/i })).toHaveAttribute('href', '/contact')
  })

  it('shows catalog freshness in the footer', async () => {
    await renderRoute('/about')

    expect(await screen.findByText(/catalog updated:/i)).toBeInTheDocument()
  })
})

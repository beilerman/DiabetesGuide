import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function getGitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
  }

  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

function getCatalogSnapshotDate() {
  const dataRoot = join(process.cwd(), 'data')
  const datedFiles = collectFiles(dataRoot)
    .map(filePath => filePath.match(/20\d{2}-\d{2}-\d{2}/)?.[0])
    .filter((date): date is string => Boolean(date))
    .sort()

  if (datedFiles.length > 0) {
    return datedFiles.at(-1)!
  }

  const newestMtime = collectFiles(dataRoot)
    .map(filePath => statSync(filePath).mtime)
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1)

  return newestMtime ? newestMtime.toISOString().slice(0, 10) : 'unknown'
}

function collectFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) return collectFiles(fullPath)
      return entry.isFile() ? [fullPath] : []
    })
  } catch {
    return []
  }
}

export default defineConfig({
  define: {
    __APP_BUILD_INFO__: JSON.stringify({
      version: 'v1.0',
      gitSha: getGitSha(),
      buildDate: new Date().toISOString(),
      catalogSnapshotDate: getCatalogSnapshotDate(),
    }),
  },
  test: {
    testTimeout: 10_000,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.svg', 'pwa-512x512.svg'],
      manifest: false, // Use public/manifest.json directly
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/rcrzdpzwcbekgqgiwqcp\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
})

import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-utils.tsx'],
    css: false,
    // This suite uses Node's native runner and is executed by npm test first.
    exclude: [...configDefaults.exclude, 'e2e/**', 'test-results/**', 'scripts/sync/workflow-guard.test.mjs'],
  },
})

import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      'deploy/**/*.test.js',
      'supabase/functions/**/*.test.ts',
      'supabase/tests/**/*.test.mjs', // Disposable PostgreSQL harnesses, not Vitest suites.
    ],
  },
})

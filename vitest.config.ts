import { defineConfig } from 'vitest/config'

// Frontend unit + integration tests: jsdom env, no real network — every test
// mocks the api/courts.ts boundary instead of hitting Supabase.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})

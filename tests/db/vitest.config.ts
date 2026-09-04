import { defineConfig } from 'vitest/config'

// DB tests run the real migration + seed SQL against a throwaway Postgres
// (DATABASE_URL env var — see README "Testing" section) and exercise RLS,
// the report-validation trigger, and the TTL decay logic directly.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Each test file does its own `drop schema public cascade` against the
    // one shared throwaway Postgres, so files must not run concurrently.
    fileParallelism: false,
  },
})

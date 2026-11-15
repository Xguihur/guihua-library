import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    // Real MongoDB is required; a missing or sandboxed database must fail the run.
    passWithNoTests: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});

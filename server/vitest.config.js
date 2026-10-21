import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ['tests/**/*.test.js'],
    fileParallelism: false,
  },
});

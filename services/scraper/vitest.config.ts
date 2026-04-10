import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Scraper touches browser automation (Playwright), network APIs and JSON paths.
      // Some defensive catch blocks and parser fallbacks are intentionally not tested
      // because they require complex mocks of external libraries.
      thresholds: {
        branches: 88,
        functions: 100,
        lines: 99,
        statements: 99,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/sources/base-source.ts'],
    },
  },
});

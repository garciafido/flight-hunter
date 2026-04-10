import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
      exclude: ['src/app/**'],
    },
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});

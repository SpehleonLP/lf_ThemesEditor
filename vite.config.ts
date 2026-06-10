import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    proxy: { '/api': 'http://localhost:8137' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

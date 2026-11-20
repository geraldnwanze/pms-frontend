import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror tsconfig's "@/*" → "./src/*".
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Each test starts from clean mocks, and real timers, so one test's fake clock can't leak into the next.
    restoreMocks: true,
    unstubGlobals: true,
  },
});

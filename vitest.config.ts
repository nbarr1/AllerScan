import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests don't load the React and Tailwind build plugins.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

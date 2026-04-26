import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json']
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts']
  }
});

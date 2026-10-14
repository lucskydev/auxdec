import { defineConfig } from 'vitest/config';

// Testes contra o Supabase real; veja integration/helpers.ts. Rodar: npm run test:integration
export default defineConfig({
  test: { environment: 'node', include: ['integration/**/*.int.test.ts'], testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
});

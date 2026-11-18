import { defineConfig } from '@playwright/test';

// Six fixture apps on fixed ports; Playwright starts them before the spec and stops them after.
const e2e = (cmd: string, port: number, path = '/', env?: Record<string, string>) => ({
  command: cmd,
  url: `http://127.0.0.1:${port}${path}`,
  reuseExistingServer: false,
  timeout: 240_000,
  env,
});
const vite = (app: string, port: number) => e2e(`pnpm --dir e2e exec vite ${app} --host 127.0.0.1 --port ${port} --strictPort`, port);
const astro = (app: string, port: number) =>
  e2e(`pnpm --dir e2e exec astro build --root ${app} && pnpm --dir e2e exec astro preview --root ${app} --host 127.0.0.1 --port ${port}`, port, '/classic/content/');

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'preview.spec.ts',
  fullyParallel: true, // one spec file of about a thousand tests: spread them over the workers
  workers: 4,
  reporter: [['list']],
  use: { browserName: 'chromium', viewport: { width: 1000, height: 900 }, locale: 'en-US' },
  webServer: [
    vite('html', 4171),
    vite('react', 4172),
    e2e('pnpm --dir e2e exec node vue-ssr/server.js', 4173, '/', { PORT: '4173', TZ: 'UTC' }), // the server runs in UTC
    vite('svelte', 4174),
    astro('astro-static', 4175),
    astro('astro-island', 4176),
  ],
});

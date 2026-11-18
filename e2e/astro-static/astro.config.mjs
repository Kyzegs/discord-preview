import { defineConfig } from 'astro/config';

// A static site: one page per fixture, because there is no query string at build time.
export default defineConfig({ server: { host: '127.0.0.1', port: 4175 }, devToolbar: { enabled: false } });

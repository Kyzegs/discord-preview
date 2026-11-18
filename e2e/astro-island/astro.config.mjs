import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({ integrations: [react()], server: { host: '127.0.0.1', port: 4176 }, devToolbar: { enabled: false } });

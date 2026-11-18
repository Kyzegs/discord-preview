// Real SSR: Vite in middleware mode (development, so Vue prints hydration warnings) and Vue's server renderer.
import { readFileSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'vite';

const port = Number(process.env.PORT ?? 4173);
// The stylesheet goes in the server's HTML, as in any real SSR setup: in Vite's dev mode the client's CSS import only
// lands once the script runs, and the unstyled first paint would move everything.
const css = readFileSync(new URL(import.meta.resolve('discord-preview/style.css')), 'utf8');
const vite = await createServer({ root: import.meta.dirname, appType: 'custom', server: { middlewareMode: true } });

createHttp((req, res) => {
  vite.middlewares(req, res, async () => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const { render } = await vite.ssrLoadModule('/src/entry-server.ts');
      const html = await render(url.searchParams.get('fixture') ?? 'classic/content');
      const page = await vite.transformIndexHtml(req.url, readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
      res.writeHead(200, { 'content-type': 'text/html' }).end(page.replace('<!--app-html-->', () => html).replace('</head>', () => `<style>${css}</style></head>`));
    } catch (e) {
      vite.ssrFixStacktrace(e);
      console.error(e);
      res.writeHead(500).end(String(e));
    }
  });
}).listen(port, '127.0.0.1');

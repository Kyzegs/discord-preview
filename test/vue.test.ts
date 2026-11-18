import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSSRApp, h } from 'vue';
import { renderToString as vueRender } from 'vue/server-renderer';
import { renderToString } from '../dist/server.js';
import { DiscordPreview } from '../dist/vue.js';
import { DEFAULTS } from './fixtures.ts';

test('vue: server rendering puts the preview’s HTML inside <discord-preview>', async () => {
  const props = { ...DEFAULTS, payload: { content: 'hello from **vue**' }, theme: 'light' as const };
  const html = await vueRender(createSSRApp({ render: () => h(DiscordPreview, props) }));
  assert.equal(html, `<discord-preview>${renderToString(props)}</discord-preview>`);
});

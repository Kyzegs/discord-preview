import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { fixtures } from '../test/fixtures.ts';

// Pixel tolerance for comparing an app's screenshot with the plain-HTML one: a pixel differs when a channel is off by
// more than CHANNEL, and the screenshots are equal when at most MAX_RATIO of the pixels differ.
const CHANNEL = 8;
const MAX_RATIO = 0.0005;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// The two astro apps are static, so each fixture is a page of its own instead of a query string.
const query = (port: number) => (name: string) => `http://127.0.0.1:${port}/?fixture=${name}`;
const pages = (port: number) => (name: string) => `http://127.0.0.1:${port}/${name}/`;
const APPS = {
  html: query(4171),
  react: query(4172),
  'vue-ssr': query(4173),
  svelte: query(4174),
  'astro-static': pages(4175),
  'astro-island': pages(4176),
};
type App = keyof typeof APPS;
const names = Object.keys(APPS) as App[];
const live = names.filter((a) => a !== 'astro-static'); // the apps with __setProps

declare global {
  interface Window {
    __setProps(partial: Record<string, unknown>): void;
    __removed: string[];
    __shifts: number[];
  }
}

// Every request that is not to a local server is answered here: images with one PNG, the rest with nothing.
const offline = (context: BrowserContext) =>
  context.route(/^(?!http:\/\/127\.0\.0\.1[:/])(https?|wss?):/, (route) =>
    route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/png', body: PNG }) : route.fulfill({ status: 204, body: '' }),
  );

const problems = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, context }) => {
  await offline(context);
  const list: string[] = [];
  problems.set(page, list);
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && list.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => list.push(`requestfailed: ${r.url()}`));
});

async function show(page: Page, app: App, name: string, extra = '') {
  await page.goto(APPS[app](name) + extra);
  await page.locator('#preview .discord-preview').waitFor();
  if (app !== 'astro-static') await page.waitForFunction(() => typeof window.__setProps === 'function');
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const shot = (page: Page) => page.locator('#preview').screenshot({ animations: 'disabled', caret: 'hide' });

// The share of pixels that differ, counted in the browser (-1 when the sizes differ).
function diff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([x, y, channel]) => {
      const load = async (s: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
        c.drawImage(bmp, 0, 0);
        return c.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [p, q] = [await load(x!), await load(y!)];
      if (p.width !== q.width || p.height !== q.height) return -1;
      let n = 0;
      for (let i = 0; i < p.data.length; i += 4) if ([0, 1, 2, 3].some((k) => Math.abs(p.data[i + k]! - q.data[i + k]!) > Number(channel))) n++;
      return n / (p.width * p.height);
    },
    [a.toString('base64'), b.toString('base64'), String(CHANNEL)],
  );
}

const clean = (page: Page) => expect(problems.get(page)).toEqual([]);

// 1. every fixture renders in every app, and looks the same as in plain HTML
for (const app of names) {
  test.describe(app, () => {
    for (const { name } of fixtures) {
      test(`renders ${name}`, async ({ page, browser }) => {
        await show(page, app, name);
        clean(page);
        if (app === 'html') return;
        const other = await (await browser.newContext()).newPage();
        await offline(other.context());
        await show(other, 'html', name);
        expect(await diff(page, await shot(page), await shot(other))).toBeLessThanOrEqual(MAX_RATIO);
        await other.context().close();
      });
    }
  });
}

const content = fixtures.find((f) => f.name === 'classic/content')!;

for (const app of live) {
  test.describe(`${app} live`, () => {
    // 2. a burst of updates in one tick ends on the last one
    test('100 updates in one tick end on the last', async ({ page }) => {
      await show(page, app, content.name);
      await page.evaluate((p) => {
        for (let i = 0; i < 100; i++) window.__setProps({ payload: { ...p, content: `update ${i}` } });
      }, content.props.payload);
      await expect(page.locator('#preview')).toContainText('update 99');
      await expect(page.locator('#preview')).not.toContainText('update 98');
      clean(page);
    });

    // 3. events: a press is answered, a click on a block draws the ring
    test('a press shows its reply', async ({ page }) => {
      await show(page, app, 'classic/buttons');
      await page.getByRole('button', { name: 'Primary' }).click();
      await expect(page.locator('#preview')).toContainText('Reply: primary');
      clean(page);
    });

    test('a click on a block selects it', async ({ page }) => {
      await show(page, app, content.name);
      const block = page.locator('#preview .cursor-pointer').first();
      await expect(block).toHaveCSS('box-shadow', 'none');
      await block.click();
      await expect(block).not.toHaveCSS('box-shadow', 'none');
      clean(page);
    });
  });
}

// 4. server-rendered apps: markup in the HTML, and nothing moves or is replaced when the client takes over
for (const app of ['vue-ssr', 'astro-island'] as const) {
  test.describe(`${app} hydration`, () => {
    for (const { name } of fixtures) {
      test(name, async ({ page, request }) => {
        expect(await (await request.get(APPS[app](name))).text()).toContain('aria-label="Message preview"');
        await page.addInitScript(() => {
          window.__removed = [];
          window.__shifts = [];
          new MutationObserver((records) => {
            for (const r of records) if (r.removedNodes.length && (r.target as Element).closest?.('discord-preview')) window.__removed.push(...[...r.removedNodes].map((n) => n.nodeName));
          }).observe(document, { childList: true, subtree: true });
          new PerformanceObserver((list) => window.__shifts.push(...list.getEntries().map((e) => (e as unknown as { value: number }).value))).observe({ type: 'layout-shift', buffered: true });
        });
        await show(page, app, name);
        await page.waitForTimeout(300);
        clean(page);
        expect(await page.evaluate(() => window.__shifts)).toEqual([]);
        if (app === 'vue-ssr') expect(await page.evaluate(() => window.__removed)).toEqual([]);
      });
    }
  });
}

// 5. astro-static ships no JavaScript
for (const { name } of fixtures) {
  test(`astro-static html ${name}`, async ({ request }) => {
    const html = await (await request.get(APPS['astro-static'](name))).text();
    expect(html).toContain('aria-label="Message preview"');
    expect(html.toLowerCase()).not.toContain('<script');
  });
}

// 6. a host whose global CSS fights every element still gets the same preview
for (const { name } of fixtures) {
  test(`hostile host ${name}`, async ({ page, browser }) => {
    await show(page, 'html', name, '&hostile=1');
    clean(page);
    const other = await (await browser.newContext()).newPage();
    await offline(other.context());
    await show(other, 'html', name);
    expect(await diff(page, await shot(page), await shot(other))).toBeLessThanOrEqual(MAX_RATIO);
    await other.context().close();
  });
}

// 7. no time zone given: the server (UTC) and the browser (Los Angeles) disagree, and the browser wins after hydration
test('vue-ssr shows the browser time zone after hydration', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  await offline(context);
  const page = await context.newPage();
  const list: string[] = [];
  problems.set(page, list);
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && list.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  expect(await (await context.request.get(APPS['vue-ssr']('tz/classic/content'))).text()).toMatch(/9:30\s?AM/);
  await show(page, 'vue-ssr', 'tz/classic/content');
  await expect(page.locator('#preview')).toContainText(/1:30\s?AM/);
  await expect(page.locator('#preview')).not.toContainText(/9:30\s?AM/);
  clean(page);
  await context.close();
});

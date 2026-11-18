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

// 3b. a select's list floats: opening it moves nothing, it isn't clipped by the preview, and Escape or a click elsewhere shuts it
const rectAfterFirstSelect = (page: Page) =>
  page.evaluate(() => {
    let n: Element | null = document.querySelector('#preview .dsel');
    while (n && !n.nextElementSibling) n = n.parentElement;
    return JSON.stringify(n!.nextElementSibling!.getBoundingClientRect());
  });

for (const app of live) {
  test.describe(`${app} select`, () => {
    test('opening a select moves nothing', async ({ page }) => {
      await show(page, app, 'classic/selects');
      const before = [await rectAfterFirstSelect(page), await page.locator('#preview .discord-preview').boundingBox()];
      const box = page.getByRole('combobox').first();
      await box.click();
      await expect(box).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('option', { name: 'Red' })).toBeVisible();
      expect([await rectAfterFirstSelect(page), await page.locator('#preview .discord-preview').boundingBox()]).toEqual(before);
      clean(page);
    });

    test('the open list is not clipped, and Escape or a click elsewhere shuts it', async ({ page }) => {
      await show(page, app, 'classic/selects');
      const box = page.getByRole('combobox', { name: 'Anyone' });
      await box.click();
      const last = page.getByRole('option', { name: '@Member' });
      const root = (await page.locator('#preview .discord-preview').boundingBox())!;
      const opt = (await last.boundingBox())!;
      expect(opt.y + opt.height).toBeGreaterThan(root.y + root.height); // it reaches past the preview's bottom edge...
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role="option"]')?.textContent, [opt.x + opt.width / 2, opt.y + opt.height / 2]);
      expect(hit).toBe('@Member'); // ...and is drawn there
      await page.keyboard.press('Escape');
      await expect(box).toHaveAttribute('aria-expanded', 'false');
      await expect(box).toBeFocused();
      await box.click();
      await expect(box).toHaveAttribute('aria-expanded', 'true');
      await page.mouse.click(900, 880); // the page, outside the preview
      await expect(box).toHaveAttribute('aria-expanded', 'false');
      clean(page);
    });

    test('a list without room below opens upward', async ({ page }) => {
      await page.setViewportSize({ width: 1000, height: 420 });
      await show(page, app, 'classic/selects');
      const box = page.getByRole('combobox', { name: 'Anyone' });
      await box.click();
      const list = (await page.getByRole('listbox', { name: 'Anyone' }).boundingBox())!;
      expect(list.y + list.height).toBeLessThanOrEqual((await box.boundingBox())!.y);
      clean(page);
    });
  });
}

// 3b'. the list and the tooltips escape every box that clips, in the preview (a container, an embed) and in the page:
// each corner of what is open is the topmost thing at that point (4px in, past the rounded corner)
const cornersShown = (el: Element) => {
  const r = el.getBoundingClientRect();
  return ([[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]] as const).every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
};
const ROLES = 'Pick your roles';

// opens the container's select and checks the list: fully shown, the select's width, 8px below it or above it
async function openShown(page: Page, side: 'down' | 'up') {
  const box = page.getByRole('combobox', { name: ROLES });
  await box.click();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('listbox', { name: ROLES });
  const [l, b] = [(await list.boundingBox())!, (await box.boundingBox())!];
  expect(Math.abs(l.width - b.width)).toBeLessThan(0.5);
  expect(Math.abs(l.x - b.x)).toBeLessThan(0.5);
  expect(Math.abs((side === 'down' ? l.y - (b.y + b.height) : b.y - (l.y + l.height)) - 8)).toBeLessThan(0.5);
  expect(await list.evaluate(cornersShown)).toBe(true);
  return { box, list, l, b };
}

for (const app of live) {
  test.describe(`${app} overlays escape clipping`, () => {
    test('a select in a container opens over its edge, moving nothing', async ({ page }) => {
      await show(page, app, 'v2/container-select');
      const before = await rectAfterFirstSelect(page);
      const { box, l } = await openShown(page, 'down');
      const container = (await page.locator('#preview .dsel').locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]').boundingBox())!;
      expect(l.y + l.height).toBeGreaterThan(container.y + container.height); // past the container's bottom edge
      expect(await rectAfterFirstSelect(page)).toBe(before);
      await page.keyboard.press('Escape');
      await expect(box).toHaveAttribute('aria-expanded', 'false');
      expect(await rectAfterFirstSelect(page)).toBe(before);
      await box.click();
      await page.getByRole('option', { name: 'Artist' }).click(); // several values: it stays open
      await expect(box).toHaveAttribute('aria-expanded', 'true');
      clean(page);
    });

    test('a select in a container near the bottom of the viewport opens upward over its top edge', async ({ page }) => {
      await show(page, app, 'v2/container-select');
      await page.evaluate(() => void (document.querySelector<HTMLElement>('#preview')!.style.marginTop = '560px'));
      const { l, b } = await openShown(page, 'up');
      expect(l.y + l.height).toBeLessThanOrEqual(b.y);
      clean(page);
    });

    test('a preview in a short host with overflow hidden', async ({ page }) => {
      await show(page, app, 'v2/container-select');
      const top = (await page.locator('#preview').boundingBox())!.y;
      const b = (await page.getByRole('combobox', { name: ROLES }).boundingBox())!;
      const height = b.y + b.height - top + 4;
      await page.evaluate((h) => void Object.assign(document.querySelector<HTMLElement>('#preview')!.style, { overflow: 'hidden', height: `${h}px` }), height);
      const { l } = await openShown(page, 'down');
      expect(l.height).toBeGreaterThan(height); // taller than the host that would clip it
      clean(page);
    });

    test('a scroll closes the list or leaves it attached, but a scroll in the list does neither', async ({ page }) => {
      await show(page, app, 'v2/container-select');
      await page.evaluate(() => void (document.body.style.paddingBottom = '2000px'));
      const { box, list } = await openShown(page, 'down');
      await list.evaluate((e) => void (e.scrollTop = 40));
      await page.waitForTimeout(100);
      await expect(box).toHaveAttribute('aria-expanded', 'true');
      await page.evaluate(() => window.scrollBy(0, 120));
      await page.waitForTimeout(100);
      if ((await box.getAttribute('aria-expanded')) === 'true') {
        const [l, b] = [(await list.boundingBox())!, (await box.boundingBox())!];
        expect(Math.abs(l.y - (b.y + b.height + 8))).toBeLessThan(0.5);
      } else await expect(list).toBeHidden();
      clean(page);
    });

    for (const name of ['v2/container-select', 'classic/embed-timestamp']) {
      test(`a timestamp tooltip in ${name} is fully shown`, async ({ page }) => {
        await show(page, app, name);
        const time = page.locator('#preview .dtip').nth(1); // the header time is the first
        await time.hover();
        const tip = time.getByRole('tooltip');
        const [t, s] = [(await tip.boundingBox())!, (await time.boundingBox())!];
        expect(t.width).toBeGreaterThan(100);
        expect(t.y + t.height).toBeLessThanOrEqual(s.y);
        // the tooltip lets the pointer through, so it is hit-tested with that undone for a moment
        await tip.evaluate((e: HTMLElement) => void (e.style.pointerEvents = 'auto'));
        expect(await tip.evaluate(cornersShown)).toBe(true);
        await tip.evaluate((e: HTMLElement) => void (e.style.pointerEvents = ''));
        clean(page);
      });
    }
  });
}

// 3c. the header time's tooltip: the full date, above and centred, on hover and keyboard focus, moving nothing (CSS only, so every app)
for (const app of names) {
  test(`${app} timestamp tooltip`, async ({ page }) => {
    await show(page, app, 'classic/selects');
    const time = page.locator('#preview .dtip').first();
    const tip = time.getByRole('tooltip');
    await expect(tip).toHaveText(/^Thursday, January 1, 2026 at 12:00\sPM$/);
    expect((await tip.boundingBox())!.width).toBeLessThanOrEqual(1); // shut: only for screen readers
    const before = [await time.boundingBox(), await page.locator('#preview .discord-preview').boundingBox()];
    await time.hover();
    const [t, s] = [(await tip.boundingBox())!, (await time.boundingBox())!];
    expect(t.width).toBeGreaterThan(100);
    expect(t.y + t.height).toBeLessThanOrEqual(s.y);
    expect(Math.abs(t.x + t.width / 2 - (s.x + s.width / 2))).toBeLessThan(1);
    expect([await time.boundingBox(), await page.locator('#preview .discord-preview').boundingBox()]).toEqual(before);
    await page.mouse.move(900, 880);
    expect((await tip.boundingBox())!.width).toBeLessThanOrEqual(1);
    if (app !== 'astro-static') {
      await time.focus(); // :focus-visible after a programmatic focus that follows no click
      await expect.poll(async () => (await tip.boundingBox())!.width).toBeGreaterThan(100);
    }
    clean(page);
  });
}

// 3d. the playground: local pictures for made-up media URLs, a heading and link per fixture, and a theme toggle
test('playground', async ({ page }) => {
  await page.goto('http://127.0.0.1:4171/');
  await page.locator('.discord-preview').first().waitFor();
  const srcs = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.discord-preview img')].map((i) => i.getAttribute('src')!));
  expect(srcs.filter((s) => s.startsWith('/samples/')).length).toBeGreaterThan(10);
  expect(srcs.filter((s) => !/^(\/samples\/|data:|https:\/\/cdn\.discordapp\.com\/embed\/avatars\/|https:\/\/cdn\.jsdelivr\.net\/)/.test(s))).toEqual([]);
  await expect(page.getByRole('link', { name: 'classic/selects', exact: true })).toHaveAttribute('href', '?fixture=classic/selects');
  const bg = () => page.locator('.discord-preview').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg()).toBe('rgb(50, 51, 57)');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect.poll(bg).toBe('rgb(251, 251, 251)');
  clean(page);
});

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

// 6b. the same with a select open and the header time's tooltip out, over the area the list and tooltip reach
test('hostile host with a select open and a tooltip shown', async ({ page, browser }) => {
  const opened = async (p: Page, extra: string) => {
    await show(p, 'html', 'classic/selects', extra);
    await p.getByRole('combobox', { name: 'Anyone' }).click();
    await p.locator('#preview .dtip').first().hover();
    const r = (await p.locator('#preview').boundingBox())!;
    return p.screenshot({ clip: { x: r.x, y: r.y, width: r.width, height: r.height + 200 }, animations: 'disabled', caret: 'hide' });
  };
  const hostile = await opened(page, '&hostile=1');
  clean(page);
  const other = await (await browser.newContext()).newPage();
  await offline(other.context());
  expect(await diff(page, hostile, await opened(other, ''))).toBeLessThanOrEqual(MAX_RATIO);
  await other.context().close();
});

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

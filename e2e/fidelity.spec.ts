import { expect, type Locator, type Page, test } from '@playwright/test';

// The sizes and colours measured in Discord's web client (Chrome, default density, 16px text, no zoom), checked on the
// reference fixtures (fixtures/reference/, the measured messages rebuilt) in the plain-HTML app. Sizes may be off by
// at most half a pixel; colours must match exactly, in Discord's Dark and Light themes.

const TOLERANCE = 0.5;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

type Theme = 'dark' | 'light';
const THEMES: Theme[] = ['dark', 'light'];

declare global {
  interface Window {
    __setProps(partial: Record<string, unknown>): void;
  }
}

test.beforeEach(async ({ context }) => {
  // no request leaves the machine: images get a 1x1 PNG, anything else nothing
  await context.route(/^(?!http:\/\/127\.0\.0\.1[:/])(https?|wss?):/, (route) =>
    route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/png', body: PNG }) : route.fulfill({ status: 204, body: '' }),
  );
});

async function open(page: Page, name: string, theme: Theme = 'dark') {
  await page.goto(`http://127.0.0.1:4171/?fixture=reference/${name}`);
  await page.locator('#preview .discord-preview').waitFor();
  await page.waitForFunction(() => typeof window.__setProps === 'function');
  if (theme !== 'dark') await page.evaluate((t) => window.__setProps({ theme: t }), theme);
  // buttons ease their colours in: wait until every transition is over
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Computed style values, by CSS property name.
const css = (l: Locator, ...props: string[]) =>
  l.evaluate((e, ps) => {
    const s = getComputedStyle(e);
    return Object.fromEntries(ps.map((p) => [p, s.getPropertyValue(p)]));
  }, props);

const box = async (l: Locator) => (await l.boundingBox())!;

// A number in px within the tolerance.
function near(actual: number | string, expected: number, what = '') {
  const n = typeof actual === 'string' ? Number.parseFloat(actual) : actual;
  expect(Math.abs(n - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE);
}
async function sizes(l: Locator, want: Record<string, number>) {
  const got = await css(l, ...Object.keys(want));
  for (const [k, v] of Object.entries(want)) near(got[k]!, v, k);
}
async function size(l: Locator, w: number | null, h: number | null) {
  const b = await box(l);
  if (w !== null) near(b.width, w, 'width');
  if (h !== null) near(b.height, h, 'height');
}

// #rrggbb plus an alpha, as getComputedStyle writes it
function rgb(hex: string, a = 1) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

// The measured colours, Dark and Light.
const C = {
  dark: {
    chat: rgb('#323339'),
    head: rgb('#ffffff'),
    text: rgb('#f3f3f4'),
    time: rgb('#9d9ea5'),
    sub: rgb('#c5c6ca'),
    link: rgb('#76aff6'),
    mention: rgb('#cdd7ff'),
    codeBg: rgb('#5966f2', 0.08),
    codeLine: rgb('#9696a0', 0.2),
    codeText: rgb('#ffffff'),
    quote: rgb('#595a63'),
    stamp: rgb('#9595a2', 0.16),
    secondary: [rgb('#ffffff'), rgb('#94949c', 0.12), rgb('#999999', 0.04)],
    select: [rgb('#f3f3f4'), rgb('#000000', 0.08), rgb('#9696a0', 0.2)],
    placeholder: rgb('#a4a5ab'),
    chip: [rgb('#ffffff'), rgb('#36373e')],
    embed: [rgb('#393a41'), rgb('#94949c', 0.12)],
    divider: rgb('#9696a0', 0.2),
    popout: [rgb('#3c3d45'), rgb('#94949c', 0.12)],
    option: rgb('#c5c6ca'),
    picked: rgb('#9696a0', 0.2),
    note: rgb('#abacb2'),
  },
  light: {
    chat: rgb('#fbfbfb'),
    head: rgb('#28282d'),
    text: rgb('#2e2e34'),
    time: rgb('#70717a'),
    sub: rgb('#595a63'),
    link: rgb('#006dd4'),
    mention: rgb('#2e3c88'),
    codeBg: rgb('#4d66e6', 0.04),
    codeLine: rgb('#9696a0', 0.4),
    codeText: rgb('#36373e'),
    quote: rgb('#c5c6ca'),
    stamp: rgb('#9595a2', 0.16),
    secondary: [rgb('#29292e'), rgb('#94949c', 0.12), rgb('#9696a0', 0.2)],
    select: [rgb('#2e2e34'), rgb('#000000', 0.02), rgb('#9696a0', 0.4)],
    placeholder: rgb('#696a73'),
    chip: [rgb('#28282d'), rgb('#fbfbfb')],
    embed: [rgb('#ffffff'), rgb('#97979e', 0.28)],
    divider: rgb('#96969f', 0.24),
    popout: [rgb('#ffffff'), rgb('#97979e', 0.28)],
    option: rgb('#595a63'),
    picked: rgb('#96969f', 0.24),
    note: rgb('#6c6d76'),
  },
};
const BLURPLE = rgb('#5865f2');

// The message element: the header's parent. The header is the line holding the author's name.
const header = (page: Page) => page.locator('#preview').getByText('Reference Bot', { exact: true }).first().locator('..');
const message = (page: Page) => header(page).locator('..');

test.describe('fidelity', () => {
  test('message frame: paddings, avatar, header, name, APP tag and time', async ({ page }) => {
    await open(page, 'text');
    const msg = message(page);
    await sizes(msg, { 'padding-top': 2, 'padding-right': 24, 'padding-bottom': 2, 'padding-left': 72, 'margin-top': 17 });
    const avatar = msg.locator('img').first();
    const [a, m, h] = [await box(avatar), await box(msg), await box(header(page))];
    near(a.width, 40, 'avatar width');
    near(a.height, 40, 'avatar height');
    expect(Number.parseFloat((await css(avatar, 'border-top-left-radius'))['border-top-left-radius']!)).toBeGreaterThanOrEqual(20); // round
    near(a.x - m.x, 16, 'avatar left');
    near(a.y - h.y, 2, 'avatar below the header top');
    near(h.height, 22, 'header height');
    const name = page.locator('#preview').getByText('Reference Bot', { exact: true }).first();
    await sizes(name, { 'font-size': 16, 'line-height': 22, 'font-weight': 500 });
    const tag = header(page).getByText('APP', { exact: true });
    await size(tag, null, 15);
    await sizes(tag, { 'font-size': 12.8, 'font-weight': 600, 'line-height': 15, 'border-top-left-radius': 4, 'padding-left': 4.4, 'padding-right': 4.4, 'margin-top': 2 });
    near((await box(tag)).x - ((await box(name)).x + (await box(name)).width), 4, 'APP tag margin');
    expect((await css(tag, 'background-color', 'color'))).toEqual({ 'background-color': BLURPLE, color: rgb('#ffffff') });
    const time = header(page).locator('.dtip').first();
    await sizes(time, { 'font-size': 12, 'font-weight': 500, 'line-height': 22 });
    near((await box(time)).x - ((await box(tag)).x + (await box(tag)).width), 4, 'time margin');
  });

  test('text: body, headings, subtext, lists, quote, code, mentions, timestamps, emoji', async ({ page }) => {
    await open(page, 'text');
    const p = page.locator('#preview');
    const first = p.getByText('dp-ref 1a', { exact: true });
    await sizes(first, { 'font-size': 16, 'line-height': 22, 'font-weight': 400 });
    expect(await css(first, 'white-space-collapse', 'text-wrap-mode')).toEqual({ 'white-space-collapse': 'break-spaces', 'text-wrap-mode': 'wrap' });
    await size(first, null, 22);
    const headings = [
      ['Heading 1', 24, 33],
      ['Heading 2', 20, 27.5],
      ['Heading 3', 16, 22],
    ] as const;
    for (const [text, fs, lh] of headings) await sizes(p.getByText(text, { exact: true }), { 'font-size': fs, 'line-height': lh, 'font-weight': 700, 'margin-top': 16, 'margin-bottom': 8 });
    await sizes(p.getByText('subtext', { exact: true }), { 'font-size': 14, 'line-height': 19.25, 'margin-top': 0 });
    const ul = p.locator('ul').first();
    await sizes(ul, { 'margin-left': 16, 'margin-top': 4, 'padding-left': 0 });
    expect(await css(ul, 'list-style-type', 'list-style-position')).toEqual({ 'list-style-type': 'disc', 'list-style-position': 'outside' });
    await sizes(ul.locator('li').first(), { 'margin-bottom': 4 });
    await sizes(ul.locator('ul'), { 'margin-left': 16 });
    expect(await css(ul.locator('ul'), 'list-style-type')).toEqual({ 'list-style-type': 'circle' });
    const quote = p.getByText('block quote', { exact: true }).locator('xpath=ancestor::blockquote');
    await sizes(quote, { 'padding-left': 12 });
    const bar = quote.locator('xpath=preceding-sibling::*[1]');
    await size(bar, 4, null);
    await sizes(bar, { 'border-top-left-radius': 4 });
    await sizes(quote.locator('..'), { 'margin-top': 4, 'margin-bottom': 4 });
    const inlineCode = p.getByText('inline code', { exact: true });
    await sizes(inlineCode, { 'font-size': 13.6, 'line-height': 18, 'padding-left': 2.72, 'padding-right': 2.72, 'padding-top': 0, 'border-top-width': 1, 'border-top-left-radius': 4 });
    const block = p.getByText('const a = 1; // code', { exact: true });
    await sizes(block, { 'font-size': 14, 'line-height': 18, 'padding-top': 7, 'padding-left': 7, 'border-top-width': 1, 'border-top-left-radius': 4 });
    await sizes(block.locator('..'), { 'margin-top': 6 });
    const user = p.getByText('@Reference Bot', { exact: true });
    await sizes(user, { 'font-size': 16, 'font-weight': 500, 'padding-left': 2, 'padding-right': 2, 'border-top-left-radius': 3 });
    const emoji = p.locator('img[alt=":tick:"]');
    await size(emoji, 22, 22);
    expect(await css(emoji, 'vertical-align')).toEqual({ 'vertical-align': 'bottom' });
    const channel = p.getByText('reference', { exact: true }).last();
    await size(channel.locator('svg'), 16, 16);
  });

  test('timestamps in text', async ({ page }) => {
    await open(page, 'timestamps');
    const stamp = page.locator('#preview .dtip').nth(1); // the header time is the first
    await sizes(stamp, { 'font-size': 16, 'line-height': 22, 'font-weight': 400, 'padding-left': 2, 'padding-right': 2, 'border-top-left-radius': 3 });
  });

  test('jumbo emoji', async ({ page }) => {
    await open(page, 'jumbo');
    const imgs = page.locator('#preview img[alt="tick"], #preview img[alt=":tick:"]');
    await expect(imgs).toHaveCount(2);
    for (const i of await imgs.all()) await size(i, 48, 48);
    await size(page.locator('#preview .break-words').first(), null, 52);
  });

  test('buttons: size, padding, type, gaps', async ({ page }) => {
    await open(page, 'buttons');
    const p = page.locator('#preview');
    for (const name of ['Primary', 'Secondary', 'Success', 'Danger', 'Disabled', 'Link', /Emoji label/]) {
      const b = p.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
      await size(b, null, 32);
      await sizes(b, { 'min-width': 60, 'padding-top': 3, 'padding-right': 11, 'padding-bottom': 3, 'padding-left': 11, 'border-top-width': 1, 'border-top-left-radius': 8, 'font-size': 14, 'line-height': 18, 'font-weight': 500 });
      expect(await css(b, 'box-sizing')).toEqual({ 'box-sizing': 'border-box' });
    }
    await size(p.getByRole('button', { name: '😀' }), 60, 32);
    const [a, b] = [await box(p.getByRole('button', { name: 'Primary' })), await box(p.getByRole('button', { name: 'Secondary' }))];
    near(b.x - (a.x + a.width), 8, 'gap between buttons');
    near((await box(p.getByRole('button', { name: 'Link' }))).y - (a.y + a.height), 6, 'gap between rows');
    const disabled = p.getByRole('button', { name: 'Disabled' });
    expect(await css(disabled, 'opacity', 'cursor', 'background-color')).toEqual({ opacity: '0.5', cursor: 'not-allowed', 'background-color': BLURPLE });
    const link = p.getByRole('button', { name: 'Link' });
    const icon = link.locator('svg');
    await size(icon, 16, 16);
    const label = link.getByText('Link');
    near((await box(icon)).x - ((await box(label)).x + (await box(label)).width), 8, 'launch icon margin');
    const emoji = p.getByRole('button', { name: /Emoji label/ }).locator('img');
    await size(emoji, 19.25, 19.25);
  });

  test('selects: closed box, chips, rows', async ({ page }) => {
    await open(page, 'selects');
    const p = page.locator('#preview');
    const one = p.getByRole('combobox', { name: 'Pick one' });
    await size(one, 400, 40);
    await sizes(one, { 'min-height': 40, 'padding-top': 8, 'padding-right': 8, 'padding-bottom': 8, 'padding-left': 12, 'border-top-width': 1, 'border-top-left-radius': 8, 'font-size': 16, 'line-height': 20, 'font-weight': 500 });
    expect(await css(one.locator('..'), 'max-width')).toEqual({ 'max-width': '100%' });
    await size(one.locator('img'), 22, 22);
    await size(one.locator('svg'), 18, 18);
    const multi = p.getByRole('combobox', { name: 'Pick up to three' });
    await size(multi, 400, 50);
    const chip = multi.getByText('Option 1', { exact: true }).locator('..');
    await size(chip, null, 32);
    await sizes(chip, { 'border-top-left-radius': 3, 'padding-top': 6, 'padding-left': 8, 'column-gap': 8 });
    const user = p.getByRole('combobox', { name: 'Pick a user' });
    await size(user, 400, 40);
    await sizes(user.getByText('Pick a user'), { 'font-size': 16, 'font-weight': 400 });
    near((await box(multi)).y - ((await box(one)).y + (await box(one)).height), 6, 'rows apart');
  });

  test('selects: the open list', async ({ page }) => {
    await open(page, 'selects');
    const p = page.locator('#preview');
    const one = p.getByRole('combobox', { name: 'Pick one' });
    const next = p.getByRole('combobox', { name: 'Pick up to three' });
    const before = [await box(next), await box(p.locator('.discord-preview'))];
    await one.click();
    const list = p.getByRole('listbox', { name: 'Pick one' });
    await expect(list).toBeVisible();
    const [s, l] = [await box(one), await box(list)];
    near(l.width, s.width, 'list width');
    near(l.x, s.x, 'list left');
    near(l.y, s.y + s.height + 8, 'list top');
    near(l.height, 282, 'list height');
    await sizes(list, { 'max-height': 282, 'border-top-width': 1, 'border-top-left-radius': 8, 'padding-top': 0 });
    expect([await box(next), await box(p.locator('.discord-preview'))]).toEqual(before);
    const option = list.getByRole('option').first();
    await size(option, null, 56);
    await sizes(option, { 'padding-top': 8, 'padding-left': 8, 'column-gap': 8, 'font-size': 14, 'line-height': 18 });
    await size(list.getByRole('option').nth(1).locator('img'), 22, 22);
    await sizes(option.locator('.dsel-t'), { 'font-weight': 600 });
    await sizes(option.locator('small'), { 'font-size': 14, 'line-height': 18, 'font-weight': 500 });
    const chosen = list.getByRole('option', { name: /Option 2/ });
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    const check = chosen.locator('svg');
    await size(check, 20, 20);
    expect(await css(check, 'color')).toEqual({ color: BLURPLE });
    const [c, o] = [await box(check), await box(chosen)];
    near(o.x + o.width - (c.x + c.width), 8, 'check inset');
  });

  test('ephemeral: bar, tint, reply line and footer', async ({ page }) => {
    await open(page, 'ephemeral-reply');
    const msg = message(page);
    const bar = msg.locator(':scope > span[aria-hidden]').first();
    const [b, m] = [await box(bar), await box(msg)];
    near(b.width, 2, 'bar width');
    near(b.height, m.height, 'bar height');
    near(b.x, m.x, 'bar left');
    expect(await css(bar, 'background-color')).toEqual({ 'background-color': BLURPLE });
    expect(await css(msg, 'background-color')).toEqual({ 'background-color': 'rgba(78, 98, 235, 0.05)' });
    await sizes(msg, { 'padding-left': 72, 'padding-right': 24, 'margin-top': 17 });
    const reply = msg.locator(':scope > div').first();
    await size(reply, null, 18);
    await sizes(reply, { 'font-size': 14, 'line-height': 18, 'margin-bottom': 4 });
    await size(reply.locator('img').first(), 16, 16);
    await expect(reply.getByText('APP')).toBeVisible();
    await expect(reply.getByText('Reference Bot', { exact: true })).toBeVisible(); // no "@": an interaction's reply doesn't ping
    await sizes(reply.getByText('Reference Bot', { exact: true }), { 'font-weight': 500 });
    await expect(reply.getByText('dp-ref 7')).toBeVisible();
    const footer = msg.getByText('Only you can see this', { exact: false }).locator('..');
    await size(footer, null, 16);
    await sizes(footer, { 'font-size': 12, 'line-height': 12, 'font-weight': 400, 'margin-top': 4 });
    await size(footer.locator('svg'), 16, 16);
    await sizes(footer.locator('svg'), { 'margin-right': 4 });
    near((await box(footer)).x, m.x + 72, 'footer at the content edge');
    const select = msg.getByRole('combobox', { name: 'Ephemeral select' });
    near((await box(footer)).y - ((await box(select)).y + (await box(select)).height), 4, 'footer under the last component');
    expect(await css(footer.getByText('Dismiss message'), 'text-decoration-line')).toEqual({ 'text-decoration-line': 'none' });
  });

  test('ephemeral: the reply to a press is an ephemeral message from the same author', async ({ page }) => {
    await open(page, 'ephemeral-button');
    await page.getByRole('button', { name: 'Ephemeral test' }).click();
    const replyMsg = page.locator('#preview').getByText('Reply: dp-ref-ephemeral').locator('xpath=ancestor::div[contains(@class,"pl-[72px]")][1]');
    await expect(replyMsg).toBeVisible();
    const m = await box(replyMsg);
    await sizes(replyMsg, { 'padding-left': 72, 'margin-top': 17 });
    expect(await css(replyMsg, 'background-color')).toEqual({ 'background-color': 'rgba(78, 98, 235, 0.05)' });
    const avatar = replyMsg.locator('img').nth(1); // the reply line's small avatar comes first
    await size(avatar, 40, 40);
    near((await box(avatar)).x - m.x, 16, 'avatar left');
    await expect(replyMsg.getByText('APP')).toHaveCount(2); // the reply line's and the header's
    await expect(replyMsg.getByText('dp-ref 7')).toBeVisible();
    await sizes(replyMsg.getByText('Reply: dp-ref-ephemeral'), { 'font-size': 16, 'line-height': 22 });
    await replyMsg.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(replyMsg).toHaveCount(0);
  });

  test('tooltip over a timestamp', async ({ page }) => {
    await open(page, 'text');
    const time = header(page).locator('.dtip').first();
    await time.hover();
    const tip = time.getByRole('tooltip');
    await expect(tip).toHaveText('Thursday, January 1, 2026 at 11:50 AM');
    await sizes(tip, { 'padding-top': 8, 'padding-right': 12, 'padding-bottom': 8, 'padding-left': 12, 'border-top-left-radius': 8, 'font-size': 14, 'line-height': 18, 'font-weight': 500, 'max-width': 200, 'border-top-width': 0 });
    const t = await box(tip);
    expect(t.width).toBeLessThanOrEqual(200 + TOLERANCE);
    near(t.height, 52, 'two lines');
    const caret = await tip.evaluate((e) => {
      const s = getComputedStyle(e, '::after');
      return [s.borderTopWidth, s.borderLeftWidth, s.borderRightWidth];
    });
    expect(caret).toEqual(['10px', '8px', '8px']); // 16 wide, 10 high
  });

  test('embed: frame, author, title, fields, thumbnail, image, footer', async ({ page }) => {
    await open(page, 'embed');
    const p = page.locator('#preview');
    const embed = p.getByText('Linked embed title').locator('xpath=ancestor::div[contains(@class,"border-l-4")][1]');
    await sizes(embed, { 'padding-top': 2, 'padding-right': 16, 'padding-bottom': 16, 'padding-left': 12, 'border-top-width': 1, 'border-right-width': 1, 'border-left-width': 4, 'border-top-left-radius': 4, 'max-width': 521 });
    expect(await css(embed, 'border-left-color')).toEqual({ 'border-left-color': BLURPLE });
    const author = p.getByRole('link', { name: 'Author name' }).locator('..');
    await sizes(author, { 'font-size': 14, 'line-height': 22, 'font-weight': 600, 'margin-top': 8 });
    await size(author.locator('img'), 24, 24);
    await sizes(p.getByText('Linked embed title').locator('xpath=ancestor::div[1]'), { 'font-size': 16, 'line-height': 22, 'font-weight': 600, 'margin-top': 8 });
    await sizes(p.getByText('Description with'), { 'font-size': 14, 'line-height': 18 });
    const name = p.getByText('Inline 1', { exact: true });
    await sizes(name, { 'font-size': 14, 'line-height': 18, 'font-weight': 600, 'margin-bottom': 2 });
    await sizes(p.getByText('Value one', { exact: true }), { 'font-size': 14, 'line-height': 18 });
    const [f1, f2] = [await box(name), await box(p.getByText('Inline 2', { exact: true }))];
    expect(f2.y).toBe(f1.y); // three inline fields share a row
    const fields = name.locator('xpath=ancestor::div[contains(@class,"grid-cols-12")][1]');
    await sizes(fields, { 'column-gap': 8, 'row-gap': 8, 'margin-top': 8 });
    const thumb = embed.locator('img[src$="/2.png"]');
    await size(thumb, 80, 80);
    await sizes(thumb, { 'border-top-left-radius': 4, 'margin-left': 16, 'margin-top': 8 });
    const image = embed.locator('img[src$="/3.png"]');
    await size(image, 256, 256);
    await sizes(image, { 'border-top-left-radius': 4 });
    await sizes(image.locator('..'), { 'margin-top': 16 });
    const footer = p.getByText('Footer text').locator('xpath=ancestor-or-self::div[1]');
    await sizes(footer, { 'font-size': 12, 'line-height': 16, 'font-weight': 500, 'margin-top': 8 });
    await size(footer.locator('img'), 20, 20);
    await sizes(footer.locator('img'), { 'margin-right': 8 });
    await expect(footer).toHaveText('Footer text•1/1/26, 12:00 PM');
  });

  test('components v2: container, sections, thumbnail, separator, gallery, buttons', async ({ page }) => {
    await open(page, 'components-v2');
    const p = page.locator('#preview');
    await sizes(p.getByText('dp-ref 6 (top-level text display)'), { 'font-size': 16, 'line-height': 22 });
    const container = p.getByText('Heading in container').locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
    await sizes(container, { 'padding-top': 16, 'padding-left': 16, 'border-top-width': 1, 'border-top-left-radius': 8, 'row-gap': 8 });
    expect(await css(container, 'overflow-x')).toEqual({ 'overflow-x': 'hidden' });
    const accent = container.locator(':scope > span[aria-hidden]');
    await size(accent, 4, (await box(container)).height - 2);
    expect(await css(accent, 'background-color', 'left')).toEqual({ 'background-color': BLURPLE, left: '0px' });
    await sizes(p.getByText('Heading in container'), { 'font-size': 24, 'line-height': 33, 'font-weight': 700, 'margin-bottom': 8, 'margin-top': 0 });
    await sizes(p.getByText('A paragraph with'), { 'font-size': 14, 'line-height': 19.25 });
    await sizes(p.getByText('small subtext'), { 'font-size': 12, 'line-height': 16.5 });
    const thumb = container.locator('img[src$="/1.png"]');
    await size(thumb, 85, 85);
    await sizes(thumb, { 'border-top-left-radius': 8 });
    await sizes(thumb.locator('..'), { 'column-gap': 12 });
    const accessory = p.getByRole('button', { name: 'Accessory' });
    await size(accessory, null, 32);
    const divider = container.locator('.border-b');
    await sizes(divider, { 'border-bottom-width': 1 });
    near((await box(divider)).width, (await box(container)).width - 34, 'divider full width');
    const [g1, g2] = [await box(container.locator('img[src$="/2.png"]')), await box(container.locator('img[src$="/3.png"]'))];
    for (const g of [g1, g2]) {
      near(g.width, 128, 'gallery item width');
      near(g.height, 128, 'gallery item height');
    }
    near(g2.x - (g1.x + g1.width), 4, 'gallery gap');
    const cell = container.locator('img[src$="/2.png"]').locator('xpath=ancestor::div[contains(@class,"rounded-[2px]")][1]');
    await sizes(cell, { 'border-top-left-radius': 2 });
    await sizes(cell.locator('..'), { 'border-top-left-radius': 8 });
    const [one, two] = [await box(p.getByRole('button', { name: 'One' })), await box(p.getByRole('button', { name: 'Two' }))];
    near(one.height, 32, 'row button');
    near(two.x - (one.x + one.width), 8, 'row gap');
  });

  test('reactions', async ({ page }) => {
    await open(page, 'text');
    const pill = page.locator('#preview').getByText('1', { exact: true }).first().locator('..');
    await size(pill, null, 30);
    await sizes(pill, { 'border-top-width': 1, 'border-top-left-radius': 8, 'margin-right': 4, 'margin-bottom': 4, 'padding-left': 6, 'padding-top': 2 });
    expect(await css(pill, 'background-color', 'border-top-color')).toEqual({ 'background-color': rgb('#94949c', 0.12), 'border-top-color': 'rgba(0, 0, 0, 0)' });
    await size(page.locator('#preview').getByText('1', { exact: true }).nth(1).locator('..').locator('img'), 20, 20);
    await sizes(page.locator('#preview').getByText('1', { exact: true }).first(), { 'font-size': 16, 'line-height': 16, 'font-weight': 600 });
  });

  for (const theme of THEMES) {
    test(`colours: ${theme}`, async ({ page }) => {
      const c = C[theme];
      const color = async (l: Locator, prop: string, want: string) => expect((await css(l, prop))[prop], prop).toBe(want);

      await open(page, 'text', theme);
      const p = page.locator('#preview');
      await color(p.locator('.discord-preview'), 'background-color', c.chat);
      await color(p.getByText('Reference Bot', { exact: true }).first(), 'color', c.head);
      await color(header(page).locator('.dtip').first(), 'color', c.time);
      await color(p.getByText('dp-ref 1a', { exact: true }), 'color', c.text);
      for (const h of ['Heading 1', 'Heading 2', 'Heading 3']) await color(p.getByText(h, { exact: true }), 'color', c.head);
      await color(p.getByText('subtext', { exact: true }), 'color', c.sub);
      await color(p.getByRole('link', { name: 'masked link' }), 'color', c.link);
      await color(p.getByText('block quote', { exact: true }).locator('xpath=ancestor::blockquote'), 'color', c.sub);
      await color(p.getByText('block quote', { exact: true }).locator('xpath=ancestor::blockquote/preceding-sibling::*[1]'), 'background-color', c.quote);
      const user = p.getByText('@Reference Bot', { exact: true });
      await color(user, 'color', c.mention);
      await color(user, 'background-color', rgb('#5864f2', 0.24));
      await color(p.getByText('reference', { exact: true }).last(), 'color', c.mention);
      await color(p.getByText('@Role', { exact: true }), 'color', rgb('#1abc9c'));
      const inlineCode = p.getByText('inline code', { exact: true });
      await color(inlineCode, 'color', c.text);
      await color(inlineCode, 'background-color', c.codeBg);
      await color(inlineCode, 'border-top-color', c.codeLine);
      const block = p.getByText('const a = 1; // code', { exact: true });
      await color(block, 'color', c.codeText);
      await color(block, 'background-color', c.codeBg);
      await color(block, 'border-top-color', c.codeLine);
      await color(p.getByText('1', { exact: true }).first(), 'color', c.sub); // a reaction's count

      await open(page, 'timestamps', theme);
      const stamp = page.locator('#preview .dtip').nth(1);
      await color(stamp, 'color', c.text);
      await color(stamp, 'background-color', c.stamp);

      await open(page, 'buttons', theme);
      const b = (name: string) => page.locator('#preview').getByRole('button', { name, exact: true });
      for (const [name, bg] of [
        ['Primary', BLURPLE],
        ['Success', rgb('#008545')],
        ['Danger', rgb('#d22d39')],
      ] as const) {
        await color(b(name), 'background-color', bg);
        await color(b(name), 'color', rgb('#ffffff'));
        await color(b(name), 'border-top-color', rgb('#ffffff', 0.08));
      }
      for (const name of ['Secondary', 'Link']) {
        await color(b(name), 'color', c.secondary[0]!);
        await color(b(name), 'background-color', c.secondary[1]!);
        await color(b(name), 'border-top-color', c.secondary[2]!);
      }

      await open(page, 'selects', theme);
      const one = page.locator('#preview').getByRole('combobox', { name: 'Pick one' });
      await color(one, 'color', c.select[0]!);
      await color(one, 'background-color', c.select[1]!);
      await color(one, 'border-top-color', c.select[2]!);
      await color(page.locator('#preview').getByText('Pick a user'), 'color', c.placeholder);
      const chip = page.locator('#preview').getByRole('combobox', { name: 'Pick up to three' }).getByText('Option 1').locator('..');
      await color(chip, 'color', c.chip[0]!);
      await color(chip, 'background-color', c.chip[1]!);
      await one.click();
      const list = page.locator('#preview').getByRole('listbox', { name: 'Pick one' });
      await color(list, 'background-color', c.popout[0]!);
      await color(list, 'border-top-color', c.popout[1]!);
      await color(list.getByRole('option').first(), 'color', c.option);
      const chosen = list.getByRole('option', { name: /Option 2/ });
      await color(chosen, 'background-color', c.picked);
      await color(chosen, 'color', c.head);
      await color(chosen.locator('small'), 'color', c.option);

      await open(page, 'embed', theme);
      const embed = page.locator('#preview').getByText('Linked embed title').locator('xpath=ancestor::div[contains(@class,"border-l-4")][1]');
      await color(embed, 'background-color', c.embed[0]!);
      await color(embed, 'border-top-color', c.embed[1]!);
      await color(page.locator('#preview').getByRole('link', { name: 'Linked embed title' }).locator('..'), 'color', c.link);
      await color(page.locator('#preview').getByText('Inline 1', { exact: true }), 'color', c.head);
      await color(page.locator('#preview').getByText('Value one', { exact: true }), 'color', c.text);
      await color(page.locator('#preview').getByText('Footer text').locator('xpath=ancestor-or-self::div[1]'), 'color', c.text);

      await open(page, 'components-v2', theme);
      const container = page.locator('#preview').getByText('Heading in container').locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
      await color(container, 'background-color', c.embed[0]!);
      await color(container, 'border-top-color', c.embed[1]!);
      await color(page.locator('#preview').getByText('Heading in container'), 'color', c.head);
      await color(page.locator('#preview').getByText('A paragraph with'), 'color', c.text);
      await color(page.locator('#preview').getByText('small subtext'), 'color', c.sub);
      await color(container.locator('.border-b'), 'border-bottom-color', c.divider);

      await open(page, 'ephemeral-reply', theme);
      const footer = page.locator('#preview').getByText('Only you can see this', { exact: false }).locator('..');
      await color(footer, 'color', c.note);
      await color(footer.getByText('Dismiss message'), 'color', c.link);
    });
  }
});

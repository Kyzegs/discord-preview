import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileSize } from '../src/shared.tsx';
import { DiscordPreview } from '../src/DiscordPreview.tsx';
import type { PreviewComponent, PreviewModal, PreviewProps } from '../src/types.ts';
import { DEFAULTS, fixtures } from './fixtures.ts';

const render = (props: PreviewProps) => renderToStaticMarkup(createElement(DiscordPreview, { ...DEFAULTS, bare: true, ...props }));
const fixture = (name: string) => render(fixtures.find((f) => f.name === name)!.props);
const v2 = (components: unknown[], extra: Partial<PreviewProps> = {}) => render({ payload: { flags: 32768, components: components as PreviewComponent[], ...extra.payload }, ...extra });
const modal = (m: unknown, extra: Partial<PreviewProps> = {}) => render({ payload: {}, modal: m as PreviewModal, ...extra });
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

test('fileSize: bytes, then two decimals', () => {
  assert.equal(fileSize(512), '512 bytes');
  assert.equal(fileSize(20480), '20.00 KB');
  assert.equal(fileSize(1234567), '1.18 MB');
  assert.equal(fileSize(5 * 1024 ** 4), '5120.00 GB');
});

test('file: the attachment name and size, else the name alone', () => {
  const html = fixture('components/v2-files');
  assert.ok(html.includes('report.pdf') && html.includes('1.18 MB'));
  assert.ok(html.includes('missing.zip'));
  assert.ok(!html.includes('an unknown type') && !html.includes('Unknown'), 'unknown types render nothing');
  assert.ok(html.includes('alt="A photo of the team"') && html.includes('alt="The second default avatar"'));
  assert.ok(v2([{ type: 13, file: { url: 'attachment://a.txt' }, name: 'given.txt', size: 2048 }]).includes('2.00 KB'));
});

test('buttons: labels stop at 80 characters, emoji-only has no label, disabled is disabled', () => {
  const label = 'x'.repeat(200);
  const html = v2([{ type: 1, components: [{ type: 2, style: 1, label, custom_id: 'a' }] }]);
  assert.ok(html.includes(`>${'x'.repeat(80)}<`) && !html.includes('x'.repeat(81)));
  const emoji = v2([{ type: 1, components: [{ type: 2, style: 2, emoji: { name: '👋' }, custom_id: 'b', disabled: true }] }]);
  assert.ok(!emoji.includes('truncate') && emoji.includes('disabled=""'));
});

test('selects: avatars, role dots, channel icons, defaults and chips', () => {
  const html = fixture('components/selects');
  assert.ok(html.includes('src="https://cdn.discordapp.com/embed/avatars/1.png"'), 'resolved avatar');
  assert.ok(html.includes('src="https://cdn.discordapp.com/embed/avatars/0.png"'), 'default avatar');
  assert.ok(html.includes('background:#3498db'), 'role colour dot');
  assert.ok(!html.includes('everyone'), '@everyone left out');
  assert.ok(html.includes('>Nelly<') && html.includes('>news<'), 'defaults shown as chosen');
  assert.equal(count(html, /rounded-md bg-\[rgb\(128_128_128\/0\.24\)\]/g), 4, 'two string chips, two role chips');
  assert.ok(html.includes('aria-multiselectable="true"'));
  // more defaults than max_values: only max_values shown
  const capped = v2([{ type: 1, components: [{ type: 3, options: [{ label: 'A', value: 'a', default: true }, { label: 'B', value: 'b', default: true }] }] }]);
  assert.equal(capped.match(/role="combobox"[^>]*>(.*?)<svg/)?.[1]?.replace(/<[^>]+>/g, ''), 'A');
});

test('modal: window, labels, inputs, nothing that submits', () => {
  const html = fixture('modal/inputs');
  assert.ok(html.includes('Report a bug') && html.includes('<strong>what happened</strong>'));
  assert.ok(!/<form|<a /.test(html), 'no form, no link');
  assert.ok(!/ name=/.test(html), 'no named field');
  assert.equal(count(html, /<button/g), count(html, /<button[^>]*type="button"/g));
  assert.equal(count(html, /> \*</g), 3, 'required by default, not when required: false');
  assert.ok(html.includes('>965<'), 'a paragraph counts down from max_length');
  assert.ok(html.includes('placeholder="The app crashes when..."') && html.includes('value="2.4.1"'));
  assert.ok(html.includes('>Cancel<') && html.includes('>Submit<'));
});

test('modal: legacy rows, choices, checkbox, file upload', () => {
  const legacy = fixture('modal/legacy');
  assert.ok(legacy.includes('Your name') && legacy.includes('Comments') && legacy.includes('>500<'));
  assert.ok(!legacy.includes('Not allowed in a modal'));
  const choices = fixture('modal/choices');
  assert.equal(count(choices, /role="radio" aria-checked="true"/g), 1);
  assert.equal(count(choices, /aria-checked="true"/g), 3, 'Sunday, Snacks and the reminder');
  assert.ok(choices.includes('Drag and drop') && choices.includes('Up to 3 files'));
  assert.ok(choices.includes('@Moderator'));
});

test('modal: at most five top-level components', () => {
  const html = modal({ title: 't', components: Array.from({ length: 9 }, (_, i) => ({ type: 10, content: `block${i}` })) });
  assert.ok(html.includes('block4') && !html.includes('block5'));
  assert.doesNotThrow(() => modal({ components: [{ type: 18, component: { type: 21, options: 'x' } }, { type: 18 }, { type: 1, components: [5] }, null] }));
});

// ---- presses and local state, in the custom element under happy-dom

const win = new Window();
after(() => win.happyDOM.close());
for (const k of ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'Node', 'MutationObserver'] as const) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? win : win[k], configurable: true, writable: true });
}
const { DiscordPreviewElement } = await import('../dist/element.js');
const tick = () => new Promise((r) => setTimeout(r, 0));
const mount = async (props: Partial<PreviewProps>) => {
  const el = new DiscordPreviewElement();
  Object.assign(el, DEFAULTS, props);
  document.body.append(el);
  await tick();
  return el as unknown as HTMLElement;
};
const option = (el: HTMLElement, text: string) => [...el.querySelectorAll('[role="option"]')].find((b) => b.textContent?.includes(text)) as HTMLElement;

test('select: a pick shows in the closed select and is reported', async () => {
  const el = await mount({ payload: { components: [{ type: 1, components: [{ type: 3, custom_id: 's', options: [{ label: 'One', value: '1' }, { label: 'Two', value: '2' }] }] }] } });
  const pressed: unknown[] = [];
  el.addEventListener('press', (e) => pressed.push((e as CustomEvent<{ component: unknown }>).detail.component));
  option(el, 'Two').click();
  await tick();
  assert.equal(el.querySelector('[role="combobox"]')?.textContent, 'Two');
  assert.deepEqual(pressed, [{ type: 3, custom_id: 's', picked: 'Two', value: '2' }]);
});

test('select: Escape and focus leaving it shut the list; focus moving inside it does not', async () => {
  const el = await mount({ payload: { components: [{ type: 1, components: [{ type: 3, options: [{ label: 'One', value: '1' }] }] }] } });
  const box = () => el.querySelector('[role="combobox"]') as HTMLElement;
  const expanded = () => box().getAttribute('aria-expanded');
  const open = async () => (box().click(), await tick(), assert.equal(expanded(), 'true'));
  await open();
  option(el, 'One').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
  await tick();
  assert.equal(expanded(), 'false', 'Escape');
  await open();
  box().dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, relatedTarget: option(el, 'One') as never }) as unknown as Event);
  await tick();
  assert.equal(expanded(), 'true', 'focus moved to an option');
  box().dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body as never }) as unknown as Event);
  await tick();
  assert.equal(expanded(), 'false', 'focus left');
});

test('select: a row with a button and a select draws only the first select', () => {
  const row = [{ type: 1, components: [{ type: 2, style: 1, label: 'Launch', custom_id: 'l' }, { type: 3, placeholder: 'First' }, { type: 3, placeholder: 'Second' }] }];
  const html = v2(row);
  assert.ok(html.includes('aria-label="First"') && !html.includes('Second') && !html.includes('Launch'));
  assert.equal(count(html, /role="combobox"/g), 1);
  assert.ok(html.includes('data-open="false"') && !html.includes('data-up'), 'shut, with no side chosen');
  assert.ok(render({ payload: { components: row as PreviewComponent[] } }).includes('aria-label="First"'), 'a legacy row too');
});

test('modal: radios and checkboxes change when clicked', async () => {
  const el = await mount({ payload: {}, modal: fixtures.find((f) => f.name === 'modal/choices')!.props.modal });
  const saturday = [...el.querySelectorAll('[role="radio"]')][0] as HTMLElement;
  saturday.click();
  await tick();
  assert.equal(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent, 'SaturdayFrom 10:00');
  const boxes = () => [...el.querySelectorAll('[role="checkbox"]')] as HTMLElement[];
  boxes()[1]!.click(); // Drinks: two of two
  await tick();
  boxes()[2]!.click(); // Games: over max_values, ignored
  await tick();
  assert.deepEqual(
    boxes().map((b) => b.getAttribute('aria-checked')),
    ['true', 'true', 'false', 'true'],
  );
});

test('modal: with interactive false nothing reacts', async () => {
  const el = await mount({ payload: {}, interactive: false, modal: fixtures.find((f) => f.name === 'modal/choices')!.props.modal });
  const state = () => [...el.querySelectorAll('[role="radio"], [role="checkbox"]')].map((b) => b.getAttribute('aria-checked'));
  const before = state();
  for (const b of el.querySelectorAll('[role="radio"], [role="checkbox"]')) (b as HTMLElement).click();
  await tick();
  assert.deepEqual(state(), before);
  const select = await mount({ payload: {}, interactive: false, modal: { components: [{ type: 18, label: 'Pick', component: { type: 3, options: [{ label: 'One', value: '1' }] } }] } });
  (select.querySelector('[role="combobox"]') as HTMLElement).click();
  await tick();
  assert.equal(select.querySelector('[role="combobox"]')?.getAttribute('aria-expanded'), 'false', 'the select stays shut');
  const text = await mount({ payload: {}, interactive: false, modal: { components: [{ type: 18, label: 'Name', component: { type: 4, value: 'Ana' } }] } });
  assert.equal((text.querySelector('input') as HTMLInputElement).readOnly, true);
  const live = await mount({ payload: {}, modal: { components: [{ type: 18, label: 'Name', component: { type: 4 } }] } });
  assert.equal((live.querySelector('input') as HTMLInputElement).readOnly, false);
});

test('media: pressing play swaps in the browser player, playing', async () => {
  const el = await mount({ payload: { embeds: [{ type: 'gifv', thumbnail: { url: 'https://e.example/t.png' }, video: { url: 'https://e.example/v.mp4', width: 400, height: 200 } }] } });
  assert.equal(el.querySelector('video'), null);
  (el.querySelector('[aria-label="Play video"]') as HTMLElement).click();
  await tick();
  const video = el.querySelector('video');
  assert.ok(video?.hasAttribute('controls') && video.autoplay && video.loop);
});

test('modal: a paragraph starts with its value and counts down as it is typed in', async () => {
  const el = await mount({ payload: {}, modal: { components: [{ type: 18, label: 'Notes', component: { type: 4, style: 2, value: 'abc', max_length: 10 } }] } });
  const area = el.querySelector('textarea') as HTMLTextAreaElement;
  assert.equal(area.value, 'abc');
  assert.ok(el.textContent?.includes('7'));
  area.value = 'abcdef';
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  assert.equal(area.value, 'abcdef');
  assert.ok(el.textContent?.includes('4'));
});

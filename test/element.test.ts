import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Window } from 'happy-dom';
import { renderToString } from '../dist/server.js';
import { DEFAULTS } from './fixtures.ts';

// <discord-preview> in happy-dom. The globals go in before dist/element.js loads, and one element is created and
// given a property before then, so the upgrade path is tested too.
const win = new Window();
after(() => win.happyDOM.close());
for (const k of ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'Node', 'MutationObserver'] as const) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? win : win[k], configurable: true, writable: true });
}

const early = document.createElement('discord-preview') as HTMLElement & { payload?: unknown };
early.payload = { content: 'set before the upgrade' };
document.body.append(early);

const { DiscordPreviewElement } = await import('../dist/element.js');
type El = InstanceType<typeof DiscordPreviewElement>;

const tick = () => new Promise((r) => setTimeout(r, 0));
const make = (setup?: (el: El) => void) => {
  const el = new DiscordPreviewElement();
  Object.assign(el, DEFAULTS);
  setup?.(el);
  document.body.append(el);
  return el;
};

test('element: registered, with prototype accessors', () => {
  assert.equal(customElements.get('discord-preview'), DiscordPreviewElement);
  const el: HTMLElement = document.createElement('discord-preview');
  assert.ok(el instanceof DiscordPreviewElement);
  assert.ok('payload' in el && 'selectable' in el && !Object.hasOwn(el, 'payload'));
});

test('element: a property set before the upgrade is picked up', async () => {
  await tick();
  assert.ok(early instanceof DiscordPreviewElement);
  assert.match(early.textContent ?? '', /set before the upgrade/);
});

test('element: a property set renders', async () => {
  const el = make((e) => (e.payload = { content: 'hello there' }));
  await tick();
  assert.match(el.textContent ?? '', /hello there/);
  assert.ok(el.querySelector('.discord-preview'), 'light DOM, no shadow root');
  assert.equal(el.shadowRoot, null);
});

test('element: attributes, with JSON payload and resolve; a later property wins', async () => {
  const el = make();
  el.setAttribute('payload', JSON.stringify({ content: 'from the attribute', channel_id: '5' }));
  el.setAttribute('resolve', JSON.stringify({ channels: { 5: { name: 'from-resolve' } } }));
  el.setAttribute('theme', 'light');
  el.setAttribute('bare', '');
  await tick();
  assert.match(el.textContent ?? '', /from the attribute/);
  assert.equal(el.theme, 'light');
  assert.equal(el.bare, true);
  el.removeAttribute('bare');
  await tick();
  assert.match(el.textContent ?? '', /from-resolve/, 'channel bar back, named from resolve');
  el.setAttribute('payload', '{not json');
  await tick();
  assert.match(el.textContent ?? '', /from the attribute/, 'invalid JSON is ignored');
  el.setAttribute('interactive', 'false');
  assert.equal(el.interactive, false);
  el.payload = { content: 'from the property' };
  el.setAttribute('payload', JSON.stringify({ content: 'attribute again' }));
  await tick();
  assert.match(el.textContent ?? '', /from the property/);
});

test('element: 100 sets in one tick render once, ending on the last value', async () => {
  const el = make((e) => (e.payload = { content: 'start' }));
  await tick();
  const records: unknown[] = [];
  const watch = new MutationObserver((r) => records.push(...r));
  watch.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
  // one set, to know how many mutations one render makes
  el.payload = { content: 'one' };
  await tick();
  const perRender = records.splice(0).length;
  assert.ok(perRender > 0);
  const payload = { content: 'v' };
  for (let i = 0; i < 100; i++) {
    payload.content = `v${i}`;
    el.payload = payload; // the same object again, mutated in place
  }
  assert.ok(el.textContent?.endsWith('one'), 'nothing rendered synchronously');
  await tick();
  watch.disconnect();
  assert.ok(el.textContent?.endsWith('v99'), el.textContent ?? '');
  assert.equal(records.length, perRender, 'one render');
});

test('element: press fires with the component, and reply() shows the reply', async () => {
  const el = make((e) => (e.payload = { content: 'x', components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Go', custom_id: 'go' }] }] }));
  await tick();
  let seen: unknown;
  document.body.addEventListener('press', (e) => {
    const { detail } = e as CustomEvent<{ component: unknown; reply(t: string): void }>;
    seen = detail.component;
    detail.reply('Pressed it');
  });
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Go');
  assert.ok(button);
  button.click();
  assert.deepEqual(seen, { type: 2, style: 1, label: 'Go', custom_id: 'go' }, 'dispatched synchronously and bubbles');
  await tick();
  assert.match(el.textContent ?? '', /Pressed it/);
  assert.match(el.textContent ?? '', /Only you can see this/);
});

test('element: selectblock fires with the path when selectable', async () => {
  const el = make((e) => (e.payload = { content: 'pick me' }));
  await tick();
  const paths: unknown[] = [];
  el.addEventListener('selectblock', (e) => paths.push((e as CustomEvent<{ path: number[] }>).detail.path));
  const block = () => el.querySelector('.cursor-pointer') as HTMLElement | null;
  assert.equal(block(), null, 'not clickable unless selectable');
  el.selectable = true;
  await tick();
  block()?.click();
  assert.deepEqual(paths, [[0]]);
});

test('element: the first render adopts server-rendered children', async () => {
  const props = { ...DEFAULTS, payload: { content: 'from the **server**', components: [{ type: 1 as const, components: [{ type: 2 as const, style: 2, label: 'Hi', custom_id: 'hi' }] }] } };
  const el = new DiscordPreviewElement();
  el.innerHTML = renderToString(props);
  const root = el.firstElementChild;
  const button = el.querySelector('button');
  assert.ok(root && button);
  Object.assign(el, props);
  document.body.append(el);
  await tick();
  assert.equal(el.firstElementChild, root, 'same root node');
  assert.equal(el.querySelector('button'), button, 'same inner nodes');
  assert.equal(el.children.length, 1);
  let pressed = false;
  el.addEventListener('press', () => (pressed = true));
  button.click();
  assert.ok(pressed, 'adopted nodes got their listeners');
});

test('element: removing unmounts, re-adding renders again', async () => {
  const el = make((e) => (e.payload = { content: 'here' }));
  await tick();
  el.remove();
  assert.equal(el.childNodes.length, 0);
  document.body.append(el);
  await tick();
  assert.match(el.textContent ?? '', /here/);
});

// ---- hostile input

const ATTACK = '"><img src=x onerror=alert(1)><script>alert(1)</script>';
const unsafe = (el: Element) =>
  [el, ...el.querySelectorAll('*')].flatMap((n) => [...(n.tagName === 'SCRIPT' ? ['script element'] : []), ...[...n.attributes].filter((a) => a.name.toLowerCase().startsWith('on')).map((a) => `${n.tagName} ${a.name}`)]);

test('element: a hostile payload gets no handlers or scripts into the DOM', async () => {
  const el = make((e) => {
    e.payload = {
      content: `${ATTACK} [x](javascript:alert(1)) <@1>`,
      author: { id: '1', username: ATTACK, avatar: 'javascript:alert(1)' },
      embeds: [{ title: ATTACK, description: ATTACK, url: 'javascript:alert(1)', image: { url: ATTACK }, footer: { text: ATTACK, icon_url: 'javascript:alert(1)' } }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: ATTACK, url: 'javascript:alert(1)' }] }],
      mentions: [{ id: '1', username: ATTACK }],
    };
  });
  await tick();
  assert.match(el.textContent ?? '', /onerror=alert/, 'shown as text');
  assert.deepEqual(unsafe(el), []);
  for (const a of el.querySelectorAll('[href], [src]')) assert.match(a.getAttribute('href') ?? a.getAttribute('src') ?? '', /^https?:\/\//);
});

test('element: a JSON attribute with __proto__ pollutes nothing', async () => {
  const el = make();
  el.setAttribute('payload', '{"__proto__":{"polluted":true},"content":"proto","constructor":{"prototype":{"polluted":true}}}');
  el.setAttribute('resolve', '{"__proto__":{"polluted":true},"users":{"__proto__":{"name":"x"}}}');
  await tick();
  assert.match(el.textContent ?? '', /proto/);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.equal((Object.prototype as { polluted?: boolean }).polluted, undefined);
});

test('element: stray children are cleared before the first render', async () => {
  const el = new DiscordPreviewElement();
  el.innerHTML = '<iframe src="https://evil.example"></iframe><p onclick="alert(1)">hi</p>';
  Object.assign(el, DEFAULTS, { payload: { content: 'clean' } });
  document.body.append(el);
  await tick();
  assert.equal(el.querySelector('iframe, p[onclick]'), null);
  assert.equal(el.children.length, 1);
  assert.match(el.textContent ?? '', /clean/);
});

test('element: a link button presses with a safe url only', async () => {
  const el = make((e) => (e.payload = { components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Bad', url: 'javascript:alert(1)' }, { type: 2, style: 5, label: 'Good', url: 'https://example.com' }] }] }));
  await tick();
  const seen: { url?: string }[] = [];
  el.addEventListener('press', (e) => seen.push((e as CustomEvent<{ component: { url?: string } }>).detail.component));
  for (const b of el.querySelectorAll('button')) b.click();
  assert.equal(seen.length, 2);
  assert.ok('url' in seen[0]! && seen[0].url === undefined);
  assert.equal(seen[1]!.url, 'https://example.com');
});

test('element: lowercase attribute aliases, and a property set to undefined falls back to the attribute', async () => {
  const el = make((e) => {
    e.payload = { content: '<t:1767268800:t>' };
    e.timeZone = undefined; // DEFAULTS set it as a property; undefined lets the attribute through
  });
  el.setAttribute('timezone', 'Asia/Tokyo');
  el.setAttribute('channelname', 'aliased');
  await tick();
  assert.equal(el.timeZone, 'Asia/Tokyo');
  assert.match(el.textContent ?? '', /aliased/);
  assert.match(el.textContent ?? '', /9:00\sPM/);
  el.channelName = 'property';
  await tick();
  assert.match(el.textContent ?? '', /property/);
  el.channelName = undefined;
  await tick();
  assert.equal(el.channelName, 'aliased');
  assert.match(el.textContent ?? '', /aliased/);
});

test('element: localMedia gates relative and data: images', async () => {
  const el = make((e) => (e.payload = { flags: 32768, components: [{ type: 12, items: [{ media: { url: '/local.png' } }] }] }));
  await tick();
  assert.equal(el.querySelector('img[src="/local.png"]'), null, 'off by default');
  el.setAttribute('local-media', '');
  await tick();
  assert.ok(el.querySelector('img[src="/local.png"]'), 'local-media attribute');
  assert.equal(el.localMedia, true);
  el.removeAttribute('local-media');
  el.setAttribute('localmedia', '');
  await tick();
  assert.ok(el.querySelector('img[src="/local.png"]'), 'localmedia alias');
  el.localMedia = false;
  await tick();
  assert.equal(el.querySelector('img[src="/local.png"]'), null, 'a property wins');
});

test('element: twemoji as attribute or property; highlight as a function property only', async () => {
  const el = make((e) => (e.payload = { content: '👍\n```js\nx\n```' }));
  await tick();
  assert.equal(el.querySelector('img[alt="👍"]'), null, 'twemoji off by default');
  el.setAttribute('twemoji', '');
  await tick();
  assert.ok(el.querySelector('img[alt="👍"]')?.getAttribute('src')?.endsWith('/1f44d.svg'));
  el.setAttribute('highlight', '<b>x</b>');
  await tick();
  assert.equal(el.querySelector('pre code'), null, 'no highlight attribute');
  el.highlight = '<b>x</b>' as never;
  await tick();
  assert.equal(el.querySelector('pre code'), null, 'a string is ignored');
  el.highlight = (code: string, lang: string) => `<i class="${lang}">${code}</i>`;
  await tick();
  assert.equal(el.querySelector('pre code')?.innerHTML, '<i class="js">x</i>');
});

test('element: pressing play makes players whose src and poster are absolute http(s)', async () => {
  const el = make(
    (e) =>
      (e.payload = {
        flags: 8192,
        attachments: [
          { filename: 'v.mp4', url: 'https://cdn.example/v.mp4', width: 640, height: 360 },
          { filename: 'a.mp3', url: 'https://cdn.example/a.mp3' },
          { filename: 'voice-message.ogg', content_type: 'audio/ogg', url: 'https://cdn.example/v.ogg', waveform: 'AAAA', duration_secs: 3 },
          { filename: 'bad.mp4', url: 'javascript:alert(1)' },
        ],
        embeds: [{ type: 'gifv', thumbnail: { url: 'https://cdn.example/t.png' }, video: { url: 'https://cdn.example/g.mp4' } }],
      }),
  );
  await tick();
  for (const b of el.querySelectorAll('[aria-label^="Play"]')) (b as HTMLElement).click();
  await tick();
  const players = [...el.querySelectorAll('video, audio')];
  assert.equal(players.length, 4);
  for (const p of players) {
    assert.match(p.getAttribute('src') ?? '', /^https?:\/\//);
    if (p.hasAttribute('poster')) assert.match(p.getAttribute('poster')!, /^https?:\/\//);
  }
  assert.equal(el.querySelector('video[poster]')?.getAttribute('poster'), 'https://cdn.example/t.png');
});

test('element: mediaUrl as a function property only', async () => {
  const el = make((e) => (e.payload = { flags: 32768, components: [{ type: 12, items: [{ media: { url: 'https://cdn.example/a.png' } }] }] }));
  el.setAttribute('mediaurl', 'https://proxy.example/');
  el.setAttribute('media-url', 'https://proxy.example/');
  await tick();
  assert.ok(el.querySelector('img[src="https://cdn.example/a.png"]'), 'no attribute');
  el.mediaUrl = 'https://proxy.example/' as never;
  await tick();
  assert.ok(el.querySelector('img[src="https://cdn.example/a.png"]'), 'a string is ignored');
  el.mediaUrl = (u: string) => `https://proxy.example/?u=${encodeURIComponent(u)}`;
  await tick();
  assert.ok(el.querySelector('img[src="https://proxy.example/?u=https%3A%2F%2Fcdn.example%2Fa.png"]'));
});

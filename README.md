# discord-preview

Discord message previews for any framework: legacy messages and Components V2, rendered from a Discord API payload

Status: work in progress, not published yet

This project is not affiliated with, endorsed by or sponsored by Discord Inc.

## Usage

Import the stylesheet once (`discord-preview/style.css`) and pass the Discord payload as `payload`. Every snippet below is what a fixture app in `e2e/` does, and `pnpm e2e` runs them in a real browser.

### React

```tsx
import { DiscordPreview } from 'discord-preview/react';
import 'discord-preview/style.css';

<DiscordPreview payload={message} onPress={(c) => `Reply: ${'picked' in c ? c.picked : c.custom_id}`} onSelectBlock={setSelected} selected={selected} />;
```

### Vue, with server rendering

The wrapper renders the preview's HTML on the server and the `<discord-preview>` element takes over it in the browser, with no hydration warnings and no layout shift.

```vue
<script setup lang="ts">
import { DiscordPreview } from 'discord-preview/vue';
import 'discord-preview/style.css';
import { ref } from 'vue';

const selected = ref<number[] | null>(null);
</script>

<template>
  <DiscordPreview :payload="message" selectable :selected="selected" @press="(d) => d.reply('Pressed')" @selectblock="(path) => (selected = path)" />
</template>
```

### Svelte

Use the custom element and give its props by name. A `{...spread}` lowercases camelCase names, so `timeZone` would never reach the element.

```svelte
<script>
  import 'discord-preview/element';
  import 'discord-preview/style.css';
  let selected = $state(null);
</script>

<discord-preview
  payload={message}
  {selected}
  selectable
  onpress={(e) => e.detail.reply('Pressed')}
  onselectblock={(e) => (selected = e.detail.path)}
></discord-preview>
```

### Astro, static

No client JavaScript: the preview's HTML is rendered at build time.

```astro
---
import { renderToString } from 'discord-preview/server';
import 'discord-preview/style.css';

const html = renderToString({ payload: message, locale: 'en-US', timeZone: 'UTC' });
---
<discord-preview set:html={html} />
```

### Astro, island

```astro
---
import Preview from '../Preview.tsx'; // a React component that renders <DiscordPreview> as above
---
<Preview client:load initial={props} />
```

### Plain HTML

Bundled by Vite or any bundler that handles CSS imports.

```html
<script type="module">
  import 'discord-preview/element';
  import 'discord-preview/style.css';
  const el = document.querySelector('discord-preview');
  el.payload = message;
  el.selectable = true;
  el.addEventListener('press', (e) => e.detail.reply('Pressed'));
  el.addEventListener('selectblock', (e) => (el.selected = e.detail.path));
</script>
<discord-preview></discord-preview>
```

Pressing a button or picking a select option dispatches a `press` event (or calls `onPress` in React) whose `detail` has the pressed `component` and a `reply(text)` that shows the text as the ephemeral reply. With `selectable` set, clicking a block dispatches `selectblock` with its `detail.path`, and passing that path back as `selected` draws the ring on it.

Set `interactive` to `false` for a preview whose controls don't react: no presses, selects stay shut, and a modal's choices and text fields keep the values the payload gave them.

Pass `locale` and `timeZone` (and `now`, for "Today at") whenever the preview is rendered on a server: left out, the server uses its own zone and the browser then switches to its own, so the time changes when the page hydrates.

Image and link URLs must be absolute http(s). Set `localMedia` (the `local-media` attribute on the element) to also show relative, `blob:` and `data:image/` images. It is meant for builders previewing their own files before upload.

### Emoji and code

- `twemoji` (also the `twemoji` attribute on the element) shows unicode emoji as Twemoji images, as Discord does, in text, reactions, poll answers, buttons and select options. The images load from jsDelivr (jdecked/twemoji at a pinned version). Off by default: emoji are then drawn by the viewer's own emoji font.
- `highlight` takes the site's own highlighter, `(code, lang) => html | undefined`. It is called for each fenced code block that names a language and holds some code (for at most 10 blocks a render), and the HTML it returns goes inside the block's `<code>`. Returning anything but a string, or throwing, leaves the block as plain text. On the element it is a property only, never an attribute. With highlight.js:

```ts
import hljs from 'highlight.js';

const highlight = (code: string, lang: string) => (hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : undefined);
```

### Media URLs

`mediaUrl` takes `(url) => url | undefined` and sees every image, video, audio, sticker, emoji, avatar and CDN URL the preview would load, after the preview's own check; what it returns is checked again. Return a proxied URL to load media through your own server, the URL itself to allow it, or nothing to leave that media out. On the element it is a property only, never an attribute.

```ts
const mediaUrl = (url: string) => `https://media-proxy.example/?url=${encodeURIComponent(url)}`;
```

## What it renders

- Message chrome: channel bar, avatar and avatar decoration, display name in role colour (gradient and holographic role styles too), role icon, server tag, APP tag with the verified tick, "Today at" times, "Sent silently" and "Read aloud", "(edited)", reply, interaction ("used /command") and forward headers, thread preview, "is thinking...", ephemeral note and reply, dark and light themes, mobile width.
- Text: Discord markdown (bold, italic, underline, strikethrough, headings, subtext, quotes and `>>>` quotes, nested lists, spoilers, inline and fenced code), links and masked links, user, role, channel, slash-command and navigation mentions, `@everyone` and `@here`, channel and message links, custom emoji, jumbo emoji, every timestamp style, and the full date in a tooltip over a timestamp and the message time.
- Embeds: rich embeds (provider, author, title, description, fields, thumbnail, image, footer, timestamp, colour), image, GIF, video and article embeds, and multi-image embed galleries.
- Attachments: images in Discord's mosaic of 1 to 10 with ALT badges, video, audio, voice messages with their waveform, other files with their size, spoilers, and stickers.
- Components: buttons in every style (premium too), string, user, role, mentionable and channel selects (filled from `resolve`), and Components V2: containers with accent colour and spoiler, sections with a thumbnail or button, text displays, media galleries, files and separators.
- Modals: title, labels and descriptions, short and paragraph text inputs, selects, file upload, radio groups, checkbox groups and checkboxes, and the legacy action-row form.
- Reactions: normal and super reactions, with counts and burst colours.
- Polls: question, answers with emoji, single or multiple choice, results and winner, vote counts and the time left.
- System messages: joins, boosts and boost levels, pins, threads, calls, channel and group changes, follows, Discovery notices, AutoMod alerts, role subscriptions, premium commands, stage events, security actions, purchases and poll results.

## Security

- Payloads may be untrusted: nothing in them is rendered as HTML, and sizes are capped at Discord's own limits, per field and per message (4000 characters of content, 6000 across the embeds, 4000 across Components V2 text).
- Image and link URLs must be absolute http(s) unless `localMedia` is set. Use `localMedia` only for builders previewing their own content, never for payloads from other people.
- Link buttons never navigate. The `press` detail carries the button's `url` only when it passed that check, and leaves it undefined otherwise.
- `highlight` is the one place HTML is inserted. Its output is trusted as written, so the highlighter must escape the code it is given (highlight.js does). It comes only from your own props: a payload or a JSON attribute can never supply it, and anything but a function is ignored.
- Every viewer's browser loads the payload's images, so whoever wrote the payload can see who looked at it (a tracking pixel), and with `localMedia` set can make it request your own site. Pass `mediaUrl` to send all media through your own proxy or an allow-list instead. Like `highlight`, it comes only from your props, a throw drops the media, and its answer must pass the same URL check.
- With `twemoji` set, every viewer's browser loads the emoji images from cdn.jsdelivr.net (through `mediaUrl` when given).
- The children of `<discord-preview>` must only come from `renderToString`.
- A preview can imitate any author, app or server, so label it as user content wherever other people see it.

## Licence

MIT. Third-party material and its licences are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

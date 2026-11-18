# @kyzegs/discord-preview

Discord message previews for any framework: legacy messages and Components V2, rendered from a Discord API payload

Status: work in progress, not published yet

This project is not affiliated with, endorsed by or sponsored by Discord Inc.

## Usage

Import the stylesheet once (`@kyzegs/discord-preview/style.css`) and pass the Discord payload as `payload`. Every snippet below is what a fixture app in `e2e/` does, and `pnpm e2e` runs them in a real browser.

### React

```tsx
import { DiscordPreview } from '@kyzegs/discord-preview/react';
import '@kyzegs/discord-preview/style.css';

<DiscordPreview payload={message} onPress={(c) => `Reply: ${'picked' in c ? c.picked : c.custom_id}`} onSelectBlock={setSelected} selected={selected} />;
```

### Vue, with server rendering

The wrapper renders the preview's HTML on the server and the `<discord-preview>` element takes over it in the browser, with no hydration warnings and no layout shift.

```vue
<script setup lang="ts">
import { DiscordPreview } from '@kyzegs/discord-preview/vue';
import '@kyzegs/discord-preview/style.css';
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
  import '@kyzegs/discord-preview/element';
  import '@kyzegs/discord-preview/style.css';
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
import { renderToString } from '@kyzegs/discord-preview/server';
import '@kyzegs/discord-preview/style.css';

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
  import '@kyzegs/discord-preview/element';
  import '@kyzegs/discord-preview/style.css';
  const el = document.querySelector('discord-preview');
  el.payload = message;
  el.selectable = true;
  el.addEventListener('press', (e) => e.detail.reply('Pressed'));
  el.addEventListener('selectblock', (e) => (el.selected = e.detail.path));
</script>
<discord-preview></discord-preview>
```

Pressing a button or picking a select option dispatches a `press` event (or calls `onPress` in React) whose `detail` has the pressed `component` and a `reply(text)` that shows the text as the ephemeral reply. With `selectable` set, clicking a block dispatches `selectblock` with its `detail.path`, and passing that path back as `selected` draws the ring on it.

Pass `locale` and `timeZone` (and `now`, for "Today at") whenever the preview is rendered on a server: left out, the server uses its own zone and the browser then switches to its own, so the time changes when the page hydrates.

Image and link URLs must be absolute http(s). Set `localMedia` (the `local-media` attribute on the element) to also show relative, `blob:` and `data:image/` images. It is meant for builders previewing their own files before upload.

## Security

- Payloads may be untrusted: nothing in them is rendered as HTML, and sizes are capped at Discord's own limits.
- Image and link URLs must be absolute http(s) unless `localMedia` is set. Use `localMedia` only for builders previewing their own content, never for payloads from other people.
- Link buttons never navigate. The `press` detail carries the button's `url` only when it passed that check, and leaves it undefined otherwise.
- The children of `<discord-preview>` must only come from `renderToString`.
- A preview can imitate any author, app or server, so label it as user content wherever other people see it.

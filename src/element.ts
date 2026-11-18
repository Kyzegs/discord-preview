import { h, render } from 'preact';
import { DiscordPreview } from './DiscordPreview.tsx';
import type { Path, Pressed, PreviewProps } from './types.ts';

export type * from './types.ts';

// What <discord-preview> takes as properties: the preview's props without the callbacks, which become events.
export type ElementProps = Omit<PreviewProps, 'onPress' | 'onSelectBlock'> & {
  selectable?: boolean; // blocks are clickable and dispatch `selectblock`
};
export interface PressDetail {
  component: Pressed;
  reply(text: string): void; // shown as the ephemeral reply
}
export interface SelectBlockDetail {
  path: Path;
}

const KEYS = ['payload', 'modal', 'resolve', 'theme', 'mobile', 'bare', 'channelName', 'interactive', 'selected', 'locale', 'timeZone', 'now', 'localMedia', 'selectable'] as const;
type Key = (typeof KEYS)[number];

const json = (v: string) => {
  try {
    return { v: JSON.parse(v) as unknown };
  } catch {
    return undefined; // invalid JSON is ignored
  }
};
// attribute name -> [property, parse]; a parse returning undefined leaves the property as it was
const ATTRS: Record<string, [Key, (v: string | null) => { v: unknown } | undefined]> = {
  theme: ['theme', (v) => ({ v: v ?? undefined })],
  mobile: ['mobile', (v) => ({ v: v !== null })],
  bare: ['bare', (v) => ({ v: v !== null })],
  selectable: ['selectable', (v) => ({ v: v !== null })],
  interactive: ['interactive', (v) => ({ v: v === null ? undefined : v !== 'false' })],
  'channel-name': ['channelName', (v) => ({ v: v ?? undefined })],
  'local-media': ['localMedia', (v) => ({ v: v !== null })],
  locale: ['locale', (v) => ({ v: v ?? undefined })],
  'time-zone': ['timeZone', (v) => ({ v: v ?? undefined })],
  payload: ['payload', (v) => (v === null ? { v: undefined } : json(v))],
  resolve: ['resolve', (v) => (v === null ? { v: undefined } : json(v))],
};
// Svelte's {...props} spread writes names in lowercase
ATTRS.timezone = ATTRS['time-zone']!;
ATTRS.channelname = ATTRS['channel-name']!;
ATTRS.localmedia = ATTRS['local-media']!;

// Under Node there is no HTMLElement: the class still exists (so importing never throws) but is never registered.
const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

// <discord-preview>: the preview as a light-DOM custom element. Adopts server-rendered children (renderToString).
export class DiscordPreviewElement extends Base {
  static observedAttributes = Object.keys(ATTRS);
  #attrs: Partial<Record<Key, unknown>> = {};
  #props: Partial<Record<Key, unknown>> = {};
  #queued = false;
  #rendered = false;

  // prototype accessors, so `'payload' in el` holds before any is set
  static {
    for (const k of KEYS) {
      Object.defineProperty(this.prototype, k, {
        configurable: true,
        enumerable: true,
        get(this: DiscordPreviewElement) {
          return this.#get(k);
        },
        set(this: DiscordPreviewElement, v: unknown) {
          this.#set(k, v);
        },
      });
    }
  }

  constructor() {
    super();
    // properties set before the element was defined are own properties that shadow the accessors
    for (const k of KEYS) {
      if (Object.hasOwn(this, k)) {
        const v = (this as Record<string, unknown>)[k];
        delete (this as Record<string, unknown>)[k];
        this.#set(k, v);
      }
    }
  }

  connectedCallback() {
    this.#queue();
  }

  disconnectedCallback() {
    render(null, this);
    this.#rendered = false;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    const a = ATTRS[name];
    const parsed = a?.[1](value);
    if (!a || !parsed) return;
    this.#attrs[a[0]] = parsed.v;
    this.#queue();
  }

  #get(k: Key) {
    return this.#props[k] !== undefined ? this.#props[k] : this.#attrs[k]; // a property set to undefined shows the attribute again
  }

  #set(k: Key, v: unknown) {
    this.#props[k] = v; // a property wins over its attribute
    this.#queue();
  }

  #queue() {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected) this.#render();
    });
  }

  #render() {
    const p = Object.fromEntries(KEYS.map((k) => [k, this.#get(k)])) as ElementProps;
    const { selectable, ...props } = p;
    const onPress = (component: Pressed) => {
      let answer: string | undefined;
      const detail: PressDetail = { component, reply: (text) => void (answer = String(text)) };
      this.dispatchEvent(new CustomEvent('press', { bubbles: true, detail }));
      return answer;
    };
    const onSelectBlock = selectable ? (path: Path) => void this.dispatchEvent(new CustomEvent('selectblock', { bubbles: true, detail: { path } satisfies SelectBlockDetail })) : undefined;
    // Preact's render() reuses the element's existing children (server HTML) as it diffs, rather than replacing them.
    // Anything but the one root renderToString writes is cleared first, so no stray markup is adopted.
    if (!this.#rendered && !(this.childNodes.length === 1 && this.firstElementChild?.classList.contains('discord-preview'))) this.replaceChildren();
    this.#rendered = true;
    render(h(DiscordPreview as never, { ...props, onPress, onSelectBlock }), this);
  }
}
export interface DiscordPreviewElement extends ElementProps {}

if (typeof customElements !== 'undefined' && !customElements.get('discord-preview')) customElements.define('discord-preview', DiscordPreviewElement);

declare global {
  interface HTMLElementTagNameMap {
    'discord-preview': DiscordPreviewElement;
  }
}

import { defineComponent, h, onMounted, type PropType, ref, watch } from 'vue';
import { type DiscordPreviewElement, type ElementProps, type PressDetail } from './element.ts';
import './element.ts';
import { renderToString } from './server.ts';
import type { Path, PreviewMessage, PreviewModal, Resolve } from './types.ts';

export type * from './types.ts';
export type { ElementProps, PressDetail, SelectBlockDetail } from './element.ts';

// Booleans default to undefined, not Vue's false, so the preview's own defaults (interactive: true) apply.
const flag = { type: Boolean, default: undefined };

// <discord-preview> for Vue. On the server its children are the preview's HTML; in the browser the element adopts
// them on hydration, and the props are assigned to it as properties (deeply watched, so in-place edits update it).
export const DiscordPreview = defineComponent({
  name: 'DiscordPreview',
  props: {
    payload: { type: Object as PropType<PreviewMessage>, required: true },
    modal: Object as PropType<PreviewModal>,
    resolve: Object as PropType<Resolve>,
    theme: String as PropType<'dark' | 'light'>,
    mobile: flag,
    bare: flag,
    channelName: String,
    interactive: flag,
    selected: { type: Array as PropType<Path | null>, default: undefined },
    locale: String,
    timeZone: String,
    now: Number,
    localMedia: flag,
    selectable: flag,
  },
  emits: {
    press: (_detail: PressDetail) => true,
    selectblock: (_path: Path) => true,
  },
  setup(props, { emit }) {
    const el = ref<DiscordPreviewElement>();
    const assign = () => void (el.value && Object.assign(el.value, props satisfies ElementProps));
    onMounted(assign);
    watch(() => props, assign, { deep: true });
    return () =>
      typeof document === 'undefined'
        ? h('discord-preview', { innerHTML: renderToString(props as ElementProps) })
        : h('discord-preview', {
            ref: el,
            onPress: (e: CustomEvent<PressDetail>) => emit('press', e.detail),
            onSelectblock: (e: CustomEvent<{ path: Path }>) => emit('selectblock', e.detail.path),
          });
  },
});

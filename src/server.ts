import { h } from 'preact';
import { renderToString as render } from 'preact-render-to-string';
import { DiscordPreview } from './DiscordPreview.tsx';
import { BUILD } from './shared.tsx';
import type { PreviewProps } from './types.ts';

export type * from './types.ts';

BUILD.preact = true;

// The preview's HTML, to put inside <discord-preview> (or any wrapper). Built against Preact (react is aliased).
export function renderToString(props: PreviewProps): string {
  return render(h(DiscordPreview as never, props));
}

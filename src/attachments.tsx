import type { ReactNode } from 'react';
import { arr, snowflake, str } from './guard.ts';
import { type AreaProps, IMG } from './shared.tsx';

// A message's stickers, from `sticker_items` (received) or `sticker_ids` (sent).
export function Stickers({ m, look }: AreaProps) {
  const items = arr(m.sticker_items).length ? arr(m.sticker_items, 3).map((s) => ({ id: snowflake(s?.id), name: str(s?.name, 30), gif: s?.format_type === 4 })) : arr(m.sticker_ids, 3).map((id) => ({ id: snowflake(id), name: '', gif: false }));
  const shown = items.filter((s) => s.id);
  if (!shown.length) return null;
  return (
    <div {...look.sel([4])} style={look.ring([4])}>
      <div className="flex flex-wrap gap-2">
        {/* shortcut: animated (Lottie) stickers have no PNG and show their alt text, fine for a preview */}
        {shown.map((s, i) => (
          <img key={i} {...IMG} src={`https://cdn.discordapp.com/stickers/${s.id}.${s.gif ? 'gif' : 'png'}`} alt={s.name || 'Sticker'} className="size-40 object-contain text-xs" />
        ))}
      </div>
    </div>
  );
}

// Filled in by later work: files attached to the message.
export function Attachments(_: AreaProps): ReactNode {
  return null;
}

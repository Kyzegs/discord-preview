import { type CSSProperties, useState } from 'react';
import { arr, int, num, obj, safeHref, snowflake, str } from './guard.ts';
import { type AreaProps, Icon, IMG, type Look, mediaSrc, Spoiler } from './shared.tsx';
import type { PreviewAttachment } from './types.ts';

const IS_VOICE_MESSAGE = 1 << 13; // message flag
const IS_SPOILER = 1 << 3; // attachment flag
export const LINK = { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } as const;
export const BLUE = '#00A8FC';

// ---- Sizes

// A width and height that fit the box, as style values, or undefined when the payload gave no usable size.
export function fit(w: unknown, h: unknown, maxW: number, maxH: number): CSSProperties | undefined {
  const W = num(w);
  const H = num(h);
  if (!W || !H || W <= 0 || H <= 0 || W > 100_000 || H > 100_000) return undefined;
  const s = Math.min(1, maxW / W, maxH / H);
  const dw = Math.max(1, Math.round(W * s));
  const dh = Math.max(1, Math.round(H * s));
  return { width: `${dw}px`, aspectRatio: `${dw} / ${dh}` };
}

export function fileSize(v: unknown): string {
  let n = num(v);
  if (n === undefined || n < 0) return '';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return i ? `${n.toFixed(2)} ${units[i]}` : `${Math.round(n)} bytes`;
}

export function duration(v: unknown): string {
  const s = Math.round(Math.min(Math.max(num(v) ?? 0, 0), 359_999));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// A voice message's base64 waveform (one byte per sample, at most 256) as `bars` heights from 0 to 1. Anything that
// isn't valid base64 gives a flat line.
export function waveform(v: unknown, bars = 40): number[] {
  const s = str(v, 400);
  let bytes: number[] = [];
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s)) {
    try {
      bytes = Array.from(atob(s).slice(0, 256), (c) => c.charCodeAt(0));
    } catch {}
  }
  return Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * bytes.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * bytes.length) / bars));
    let max = 0;
    for (let k = from; k < to && k < bytes.length; k++) max = Math.max(max, bytes[k]!);
    return max / 255;
  });
}

// ---- Media

// A <video> in Discord's box, never playing until asked.
export function Video({ url, poster, width, height, maxW = 550, maxH = 350, loop = false, look }: { url: unknown; poster?: unknown; width?: unknown; height?: unknown; maxW?: number; maxH?: number; loop?: boolean; look: Look }) {
  const src = mediaSrc(url, look);
  const style = fit(width, height, maxW, maxH) ?? { width: `${Math.min(400, maxW)}px`, aspectRatio: '16 / 9' };
  if (!src) return <div aria-hidden className="max-w-full rounded-lg" style={{ ...style, background: look.P.embed }} />;
  return <video {...IMG} controls preload="none" loop={loop} src={src} poster={mediaSrc(poster, look)} className="block max-w-full rounded-lg bg-black" style={style} />;
}

export interface MosaicItem {
  url?: unknown;
  alt?: unknown;
  spoiler?: boolean;
  width?: unknown;
  height?: unknown;
}

// An image with Discord's ALT badge when it has a description. `box` sizes a lone image; in a grid it fills its cell.
function Pic({ item, look, single, box }: { item: MosaicItem; look: Look; single?: boolean; box?: CSSProperties }) {
  const src = mediaSrc(item.url, look);
  const alt = str(item.alt, 1024);
  return (
    <div className={single ? 'relative' : 'relative size-full'}>
      {src ? (
        <img {...IMG} src={src} alt={alt} className={`block object-cover ${single ? 'max-w-full' : 'size-full'}`} style={single ? (box ?? { maxWidth: '550px', maxHeight: '350px' }) : undefined} />
      ) : (
        <div aria-hidden className={single ? 'max-w-full' : 'size-full'} style={{ ...(single ? (box ?? { width: '400px', aspectRatio: '16 / 9' }) : {}), background: look.P.embed }} />
      )}
      {alt && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1 text-[10px] leading-4 font-bold text-white">ALT</span>}
    </div>
  );
}

// Each cell's child (the spoiler, or the image) and the spoiler's blurred layer take the cell's height.
const CELL = 'relative min-w-0 overflow-hidden *:h-full [&>div>div]:h-full';

// Discord's image mosaic for 1 to 10 images: one at its own size, three as one tall and two stacked, four as a 2x2
// grid, and otherwise rows of three with the remainder (one or two) on top.
export function Mosaic({ items: raw, look }: { items: readonly MosaicItem[]; look: Look }) {
  const items = raw.slice(0, 10);
  const n = items.length;
  if (!n) return null;
  if (n === 1) {
    const item = items[0]!;
    return (
      <div className="w-fit max-w-full overflow-hidden rounded-lg">
        <Spoiler on={item.spoiler}>
          <Pic item={item} look={look} single box={fit(item.width, item.height, 550, 350)} />
        </Spoiler>
      </div>
    );
  }
  const three = n === 3;
  const rows = n === 4 ? [2, 2] : [...(n % 3 ? [n % 3] : []), ...Array<number>(Math.floor(n / 3)).fill(3)];
  const sizes = rows.flatMap((size) => Array<number>(size).fill(size));
  const cell = (i: number) => {
    if (three) return i === 0 ? 'row-span-2' : '';
    const size = sizes[i];
    return size === 1 ? 'col-span-6 aspect-[16/9]' : size === 3 ? 'col-span-2 aspect-square' : n === 4 ? 'col-span-3 aspect-[3/2]' : 'col-span-3 aspect-square';
  };
  return (
    <div className={`grid w-full max-w-[550px] gap-1 overflow-hidden rounded-lg ${three ? 'aspect-[3/2] grid-cols-2 grid-rows-2' : 'grid-cols-6'}`}>
      {items.map((item, i) => (
        <div key={i} className={`${CELL} ${cell(i)}`}>
          <Spoiler on={item.spoiler}>
            <Pic item={item} look={look} />
          </Spoiler>
        </div>
      ))}
    </div>
  );
}

// ---- Files

// A page with a folded corner (drawn for this package).
function FileIcon({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" width="30" height="40" viewBox="0 0 30 40" className="shrink-0">
      <path d="M2 2h18l8 8v28H2z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 2v8h8M8 20h14M8 26h14M8 32h9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// The file's name as a link, its size, and a download link: the top of the file and audio cards.
function FileHead({ a, look }: { a: PreviewAttachment; look: Look }) {
  const { P } = look;
  const href = safeHref(a.url);
  const name = str(a.title, 1024) || str(a.filename, 1024) || 'file';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <FileIcon color={P.muted} />
      <div className="min-w-0 flex-1">
        {href ? (
          <a {...LINK} href={href} className="block truncate text-base hover:underline" style={{ color: BLUE }}>
            {name}
          </a>
        ) : (
          <div className="truncate text-base" style={{ color: P.head }}>
            {name}
          </div>
        )}
        <div className="text-xs" style={{ color: P.muted }}>
          {fileSize(a.size)}
        </div>
      </div>
      {href && (
        <a {...LINK} href={href} aria-label="Download" className="shrink-0" style={{ color: P.muted }}>
          <Icon name="download" size={24} />
        </a>
      )}
    </div>
  );
}

const card = (look: Look): CSSProperties => ({ background: look.P.embed, borderColor: look.P.selectBorder });

function FileCard({ a, look }: { a: PreviewAttachment; look: Look }) {
  return (
    <div className="w-[432px] max-w-full rounded-lg border p-4" style={card(look)}>
      <FileHead a={a} look={look} />
    </div>
  );
}

function AudioCard({ a, look }: { a: PreviewAttachment; look: Look }) {
  const src = mediaSrc(a.url, look);
  return (
    <div className="flex w-[432px] max-w-full flex-col gap-3 rounded-lg border p-4" style={card(look)}>
      <FileHead a={a} look={look} />
      {src && <audio {...IMG} controls preload="none" src={src} className="w-full" />}
    </div>
  );
}

// A voice message: a play button, the waveform and the length. Play swaps in the browser's own player.
function Voice({ a, look }: { a: PreviewAttachment; look: Look }) {
  const { P } = look;
  const [open, setOpen] = useState(false);
  const src = mediaSrc(a.url, look);
  if (open && src) return <audio {...IMG} controls preload="none" src={src} className="w-[400px] max-w-full" />;
  return (
    <div className="flex h-14 w-[400px] max-w-full items-center gap-3 rounded-lg border px-3" style={card(look)}>
      <button
        type="button"
        aria-label="Play voice message"
        disabled={!src}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-[#5865F2] text-white"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 4v16l13-8z" />
        </svg>
      </button>
      <div aria-hidden className="flex h-5 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
        {waveform(a.waveform).map((v, i) => (
          <span key={i} className="w-[3px] shrink-0 rounded-full" style={{ height: `${Math.round(3 + v * 17)}px`, background: P.muted }} />
        ))}
      </div>
      <span className="shrink-0 text-xs tabular-nums" style={{ color: P.muted }}>
        {duration(a.duration_secs)}
      </span>
    </div>
  );
}

const EXT = {
  image: /\.(png|jpe?g|gif|webp|avif|bmp)$/i,
  video: /\.(mp4|webm|mov|m4v)$/i,
  audio: /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus)$/i,
};
const KINDS = ['image', 'video', 'audio'] as const;

// What an attachment is, by its content type, else its file extension.
export function kind(a: PreviewAttachment): (typeof KINDS)[number] | 'file' {
  const t = str(a.content_type, 100).toLowerCase();
  const name = str(a.filename, 260);
  return KINDS.find((k) => t.startsWith(`${k}/`)) ?? KINDS.find((k) => EXT[k].test(name)) ?? 'file';
}

const spoiler = (a: PreviewAttachment) => str(a.filename, 260).startsWith('SPOILER_') || ((int(a.flags) ?? 0) & IS_SPOILER) !== 0;

// Files attached to the message: images in one mosaic, then videos, audio, voice messages and other files in order.
export function Attachments({ m, look }: AreaProps) {
  const list = arr(m.attachments, 10).flatMap((a) => obj(a) ?? []);
  if (!list.length) return null;
  const voice = ((int(m.flags) ?? 0) & IS_VOICE_MESSAGE) !== 0;
  const images = list.filter((a) => kind(a) === 'image');
  return (
    <div className="flex flex-col gap-2">
      <Mosaic items={images.map((a) => ({ url: a.url, alt: a.description, spoiler: spoiler(a), width: a.width, height: a.height }))} look={look} />
      {list.map((a, i) => {
        const k = kind(a);
        if (k === 'image') return null;
        const body =
          voice && (k === 'audio' || str(a.waveform)) ? (
            <Voice a={a} look={look} />
          ) : k === 'video' ? (
            <Video url={a.url} width={a.width} height={a.height} look={look} />
          ) : k === 'audio' ? (
            <AudioCard a={a} look={look} />
          ) : (
            <FileCard a={a} look={look} />
          );
        return (
          <div key={i} className="w-fit max-w-full">
            <Spoiler on={spoiler(a)}>{body}</Spoiler>
          </div>
        );
      })}
    </div>
  );
}

// ---- Stickers

// A message's stickers, from `sticker_items` (received) or `sticker_ids` (sent, shown as PNG).
export function Stickers({ m, look }: AreaProps) {
  const items = arr(m.sticker_items).length
    ? arr(m.sticker_items, 3).map((s) => ({ id: snowflake(s?.id), name: str(s?.name, 30), format: int(s?.format_type) ?? 1 }))
    : arr(m.sticker_ids, 3).map((id) => ({ id: snowflake(id), name: '', format: 1 }));
  const shown = items.filter((s) => s.id);
  if (!shown.length) return null;
  return (
    <div {...look.sel([4])} style={look.ring([4])}>
      <div className="flex flex-wrap gap-2">
        {shown.map((s, i) => {
          // Lottie (3) stickers need a player: a neutral tile with the name instead. PNG and APNG share the .png URL.
          if (s.format === 3)
            return (
              <div key={i} className="grid size-40 place-items-center rounded-lg p-2 text-center text-sm" style={{ background: look.P.embed, color: look.P.muted }}>
                {s.name || 'Sticker'}
              </div>
            );
          const src = s.format === 4 ? `https://media.discordapp.net/stickers/${s.id}.gif` : `https://cdn.discordapp.com/stickers/${s.id}.png`;
          return <img key={i} {...IMG} src={src} alt={s.name || 'Sticker'} className="size-40 object-contain text-xs" />;
        })}
      </div>
    </div>
  );
}

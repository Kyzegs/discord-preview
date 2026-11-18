import { type CSSProperties, type ReactNode, useState } from 'react';
import { arr, int, obj, safeSrc, snowflake, str } from './guard.ts';
import type { Path, Pressed, PreviewEmoji, PreviewMessage, Resolve } from './types.ts';

// A Discord-client replica, so it keeps Discord's own colours rather than the host page's theme.
export const PALETTES = {
  dark: {
    bg: '#313338',
    border: '#26272B',
    head: '#F2F3F5',
    hash: '#80848E',
    text: '#DBDEE1',
    muted: '#949BA4',
    container: '#393A41',
    embed: '#2B2D31',
    sep: '#4E5058',
    mentionBg: 'rgba(88,101,242,0.3)',
    mention: '#C9CDFB',
    code: '#2B2D31',
    spoiler: '#1E1F22',
    quote: '#4E5058',
    secondary: '#4E5058',
    selectBg: '#1E1F22',
    selectBorder: '#1E1F22',
  },
  light: {
    bg: '#FFFFFF',
    border: '#E1E2E4',
    head: '#060607',
    hash: '#6D6F78',
    text: '#313338',
    muted: '#5C5E66',
    container: '#F2F3F5',
    embed: '#F2F3F5',
    sep: '#D4D7DC',
    mentionBg: 'rgba(88,101,242,0.15)',
    mention: '#505CDC',
    code: '#E3E5E8',
    spoiler: '#B5BAC1',
    quote: '#D4D7DC',
    secondary: '#6D6F78',
    selectBg: '#EBEBED',
    selectBorder: '#D4D7DC',
  },
};
export type Palette = (typeof PALETTES)['dark'];

// What every area of the preview reads besides its own part of the message.
export interface Look {
  P: Palette;
  classic: boolean; // a legacy message: smaller headings than Components V2
  m: PreviewMessage; // the whole message, for attachment:// links and mention names
  resolve: Resolve;
  now: number;
  locale?: string;
  timeZone?: string;
  localMedia: boolean; // relative, blob: and data:image/ sources allowed
  press: (c: Pressed) => void;
  ring: (p: Path) => CSSProperties;
  sel: (p: Path) => { onClick?: (e: { stopPropagation(): void }) => void; className?: string };
}

// The props of each area that reads the message itself (replies, reactions, attachments...).
export interface AreaProps {
  m: PreviewMessage;
  look: Look;
}

// Only a whole number in range becomes a colour, so no payload string reaches a style.
export const hex = (n: unknown): string | undefined => {
  const v = int(n);
  return v !== undefined && v >= 0 && v <= 0xffffff ? `#${v.toString(16).padStart(6, '0')}` : undefined;
};

export const emojiUrl = (id: string, animated: boolean) => `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;

// ---- Dates. Formatting never throws: a bad locale or time zone falls back to en-US in UTC, a bad date to ''.

export function dateText(ms: number, opts: Intl.DateTimeFormatOptions, look: Pick<Look, 'locale' | 'timeZone'>): string {
  for (const [locale, timeZone] of [
    [look.locale, look.timeZone],
    ['en-US', 'UTC'],
  ]) {
    try {
      return new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(ms);
    } catch {}
  }
  return '';
}

const NUMERIC_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
const FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  t: { timeStyle: 'short' },
  T: { timeStyle: 'medium' },
  d: NUMERIC_DATE,
  D: { dateStyle: 'long' },
  f: { dateStyle: 'long', timeStyle: 'short' },
  F: { dateStyle: 'full', timeStyle: 'short' },
  s: { ...NUMERIC_DATE, hour: 'numeric', minute: '2-digit' },
  S: { ...NUMERIC_DATE, hour: 'numeric', minute: '2-digit', second: '2-digit' },
};

// What Discord shows for <t:unix:style>, or '' when the number is too far out to be a date (Discord shows the tag as typed).
export function timestampText(unix: number, style: string, look: Look): string {
  const ms = unix * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return '';
  if (style === 'R') return relativeTime(ms - look.now, look.locale);
  return dateText(ms, Object.hasOwn(FORMATS, style) ? FORMATS[style]! : FORMATS.f!, look);
}

// Discord rounds like moment's fromNow: under 45 seconds, 45 minutes, 22 hours, 26 days and 11 months stay in that unit.
function relativeTime(diff: number, locale?: string) {
  let fmt: Intl.RelativeTimeFormat;
  try {
    fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  } catch {
    fmt = new Intl.RelativeTimeFormat('en-US', { numeric: 'always' });
  }
  const sign = diff < 0 ? -1 : 1;
  const s = Math.round(Math.abs(diff) / 1000);
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  const months = Math.round(Math.abs(diff) / 86_400_000 / 30.436875);
  if (s < 45) return fmt.format(sign * s, 'second');
  if (m < 45) return fmt.format(sign * m, 'minute');
  if (h < 22) return fmt.format(sign * h, 'hour');
  if (d < 26) return fmt.format(sign * d, 'day');
  if (months < 11) return fmt.format(sign * Math.max(1, months), 'month');
  return fmt.format(sign * Math.max(1, Math.round(Math.abs(diff) / 86_400_000 / 365.2425)), 'year');
}

// ---- Media

// On every <img>: no referrer to image hosts.
export const IMG = { referrerPolicy: 'no-referrer' } as const;

// A usable image URL, with attachment://name pointing at the message's attachment of that name.
export function mediaSrc(url: unknown, look: Look): string | undefined {
  const u = str(url);
  if (!u.startsWith('attachment://')) return safeSrc(u, look.localMedia);
  const name = u.slice('attachment://'.length);
  return safeSrc(arr(look.m.attachments, 10).find((a) => a?.filename === name && typeof a.url === 'string')?.url, look.localMedia);
}

export function Thumb({ url, look }: { url: unknown; look: Look }) {
  const src = mediaSrc(url, look);
  if (src) return <img {...IMG} src={src} alt="" className="size-[72px] shrink-0 rounded-lg object-cover @max-[320px]:size-12" />;
  return <span aria-hidden className="size-[72px] shrink-0 rounded-lg @max-[320px]:size-12" style={{ background: look.P.embed }} />;
}

export function Img({ url, alt, look, className = '' }: { url: unknown; alt?: unknown; look: Look; className?: string }) {
  const src = mediaSrc(url, look);
  if (src) return <img {...IMG} src={src} alt={str(alt, 1024)} className={`w-full rounded-lg object-cover ${className}`} />;
  return <div aria-hidden className={`h-40 w-full rounded-lg ${className}`} style={{ background: look.P.embed }} />;
}

export const Emo = ({ e }: { e?: PreviewEmoji | null }) => {
  const o = obj(e);
  const id = snowflake(o?.id);
  const name = str(o?.name, 32);
  return id ? <img {...IMG} src={emojiUrl(id, o?.animated === true)} alt={name} className="size-[18px]" /> : name ? <span>{name}</span> : null;
};

export function Spoiler({ on, children }: { on?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (!on || shown) return <>{children}</>;
  return (
    <div className="relative overflow-hidden rounded-lg">
      <div aria-hidden className="pointer-events-none flex flex-col gap-3 blur-xl select-none">
        {children}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShown(true);
        }}
        className="absolute inset-0 grid place-items-center bg-black/30 text-[13px] font-bold tracking-wide text-white"
      >
        SPOILER
      </button>
    </div>
  );
}

// ---- Icons: paths from Lucide (https://lucide.dev, ISC License).

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const ICONS = {
  clipboard: 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01',
  chevronDown: 'M6 9l6 6 6-6',
  eye: `M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0${circle(12, 12, 3)}`,
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, stroke = 2, className = '', fill }: { name: IconName; size?: number; stroke?: number; className?: string; fill?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

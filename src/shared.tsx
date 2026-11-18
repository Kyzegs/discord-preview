import { type CSSProperties, type ReactNode, useState } from 'react';
import { arr, int, num, obj, own, safeSrc, snowflake, str } from './guard.ts';
import type { Highlight, MediaUrl, Path, Pressed, PreviewEmoji, PreviewMember, PreviewMessage, PreviewUser, Resolve } from './types.ts';

// Which build this is: the Preact entries (element, server) set `preact`, the React one leaves it false. Only where the
// two libraries need different props for the same markup.
export const BUILD = { preact: false };

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
  interactive: boolean; // false: nothing reacts (no presses, selects stay shut, choices and text stay as given)
  twemoji: boolean; // unicode emoji as Twemoji images
  highlight?: Highlight; // the host's code highlighter, never from the payload
  mediaUrl?: MediaUrl; // the host's media URL hook, never from the payload
  budget: Budget; // made fresh by each render of the root
  press: (c: Pressed) => void;
  ring: (p: Path) => CSSProperties;
  sel: (p: Path) => { onClick?: (e: { stopPropagation(): void }) => void; className?: string };
}

// What one render may spend: highlighter calls, each remembered by its block so a re-render reuses the result.
export interface Budget {
  highlights: number;
  highlighted: Map<string, string | undefined>;
}
export const newBudget = (): Budget => ({ highlights: 10, highlighted: new Map() });

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

export const LINK = { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } as const;
export const BLUE = '#00A8FC';
export const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

export const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

// What Discord shows for a file's size: bytes below 1 KB, else two decimals of KB, MB or GB; '' when it isn't a size.
export function fileSize(v: unknown): string {
  let n = num(v);
  if (n === undefined || n < 0) return '';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return i ? `${n.toFixed(2)} ${units[i]}` : `${Math.round(n)} bytes`;
}

// resolve's name, then the server nickname, then the display name, then the username.
export function displayName(u: unknown, member: unknown, look: Look, fallback = 'Unknown') {
  const a = obj(u as PreviewUser);
  return str(own(look.resolve.users, a?.id)?.name, 100) || str(obj(member as PreviewMember)?.nick, 32) || str(a?.global_name, 100) || str(a?.username, 100) || fallback;
}

// ---- Emoji

// Every RGI emoji, sequences included (flags, keycaps, skin tones, ZWJ). The v flag makes it a set of fixed strings,
// tried longest first, so a match never backtracks past one emoji.
export const EMOJI = /(\p{RGI_Emoji})/v; // one capture group, for split()
const ONE_EMOJI = /^\p{RGI_Emoji}$/v;
export const isEmoji = (s: string) => ONE_EMOJI.test(s);

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/';
const ZWJ = String.fromCodePoint(0x200d);
const VS16 = String.fromCodePoint(0xfe0f); // the emoji presentation selector
// Twemoji's file naming: the code points in lowercase hex joined by '-', without U+FE0F unless the sequence has a ZWJ.
export const twemojiUrl = (e: string) =>
  `${TWEMOJI}${[...(e.includes(ZWJ) ? e : e.replaceAll(VS16, ''))].map((c) => c.codePointAt(0)!.toString(16)).join('-')}.svg`;

// An emoji: a custom one's image, a unicode one as Twemoji (when asked for) or as text. Without `look` (DiscordSelect's
// own options) its URL has no host hook to pass.
export const Emo = ({ e, look }: { e?: PreviewEmoji | null; look?: Look }) => {
  const o = obj(e);
  const id = snowflake(o?.id);
  const name = str(o?.name, 32);
  const url = id ? emojiUrl(id, o?.animated === true) : look?.twemoji && isEmoji(name) ? twemojiUrl(name) : undefined;
  const src = url && look ? mediaSrc(url, look) : url;
  if (src) return <img {...IMG} src={src} alt={name} className="size-[18px]" />;
  return name ? <span>{name}</span> : null;
};

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

// "Today at 16:20" on the day of `now` in the preview's time zone, else a short date and time.
export function headerTime(ms: number, look: Look) {
  const day = (t: number) => dateText(t, { dateStyle: 'short' }, look);
  const today = day(ms);
  return today && today === day(look.now) ? `Today at ${dateText(ms, { timeStyle: 'short' }, look)}` : dateText(ms, { dateStyle: 'short', timeStyle: 'short' }, look);
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
// Every media URL in the preview passes here, so the host's mediaUrl hook sees each one: its answer is checked again,
// and undefined (or a throw) drops that media.
export function mediaSrc(url: unknown, look: Look): string | undefined {
  const u = str(url);
  const name = u.startsWith('attachment://') ? u.slice('attachment://'.length) : undefined;
  const src = safeSrc(name === undefined ? u : arr(look.m.attachments, 10).find((a) => a?.filename === name && typeof a.url === 'string')?.url, look.localMedia);
  if (!src || !look.mediaUrl) return src;
  try {
    return safeSrc(look.mediaUrl(src), look.localMedia);
  } catch {
    return undefined;
  }
}

export function Thumb({ url, alt, look }: { url: unknown; alt?: unknown; look: Look }) {
  const src = mediaSrc(url, look);
  if (src) return <img {...IMG} src={src} alt={str(alt, 1024)} className="size-[72px] shrink-0 rounded-lg object-cover @max-[320px]:size-12" />;
  return <span aria-hidden className="size-[72px] shrink-0 rounded-lg @max-[320px]:size-12" style={{ background: look.P.embed }} />;
}

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
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  voice: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6M19.364 18.364a9 9 0 0 0 0-12.728',
  megaphone: 'm3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6',
  forum: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', // also the message bubble of a channel link
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  file: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  reply: 'M20 18v-2a4 4 0 0 0-4-4H4M9 17l-5-5 5-5',
  forward: 'M4 18v-2a4 4 0 0 1 4-4h12M15 17l5-5-5-5',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
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

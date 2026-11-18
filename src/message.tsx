import type { CSSProperties, ReactNode } from 'react';
import { Attachments, Stickers } from './attachments.tsx';
import { Embed } from './embed.tsx';
import { arr, bool, int, LOOKUP, obj, own, safeSrc, snowflake, str } from './guard.ts';
import { inline, Markdown } from './markdown.tsx';
import { type AreaProps, dateText, hex, Icon, IMG, type Look } from './shared.tsx';
import type { PreviewMember, PreviewMessage, PreviewUser, Resolve } from './types.ts';

const IS_CROSSPOST = 1 << 1;
const SUPPRESS_EMBEDS = 1 << 2;
const SUPPRESS_NOTIFICATIONS = 1 << 12;
const VERIFIED_BOT = 1 << 16;
const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';
const HASH = /^(a_)?[0-9a-f]{32}$/; // a CDN image hash, the only payload string put into these CDN paths
const BLURPLE = '#5865f2';
const LINK = '#00A8FC';

// Lucide paths (ISC License), like the shared icons.
const REPLY = 'M20 18v-2a4 4 0 0 0-4-4H4M9 17l-5-5 5-5';
const FORWARD = 'M4 18v-2a4 4 0 0 1 4-4h12M15 17l5-5-5-5';
const IMAGE = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0';

export const hasFlag = (m: PreviewMessage, bit: number) => ((int(m.flags) ?? 0) & bit) !== 0;

function Glyph({ d, size }: { d: string; size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

// ---- Who wrote it

function avatarSrc(u: PreviewUser | undefined, look: Look) {
  const id = str(u?.id);
  const custom = str(own(look.resolve.users, id)?.avatar);
  if (custom) return safeSrc(custom, look.localMedia);
  const av = str(u?.avatar, 64);
  if (/[/:]/.test(av)) return safeSrc(av, look.localMedia);
  if (/^\w+$/.test(av) && snowflake(id)) return `https://cdn.discordapp.com/avatars/${id}/${av}.png?size=80`;
  return undefined;
}

// resolve's name, then the server nickname, then the display name, then the username.
export function displayName(u: unknown, member: unknown, look: Look) {
  const a = obj(u as PreviewUser);
  return str(own(look.resolve.users, a?.id)?.name, 100) || str(obj(member as PreviewMember)?.nick, 32) || str(a?.global_name, 100) || str(a?.username, 100) || 'Unknown';
}

type Role = NonNullable<Resolve['roles']>[string];

// The member's roles found in resolve, highest first.
function rolesOf(member: unknown, look: Look) {
  return arr(obj(member as PreviewMember)?.roles, LOOKUP)
    .flatMap((id) => {
      const r = own(look.resolve.roles, id);
      return r ? [{ id: str(id), r, pos: int(r.position) ?? 0 }] : [];
    })
    .sort((a, b) => b.pos - a.pos);
}

// One colour, two for a gradient, three for the holographic style. A primary colour of 0 means none.
function roleColours(r: Role): string[] {
  const c = obj(r.colors);
  const primary = hex(c?.primary_color) ?? hex(r.color);
  if (!primary || primary === '#000000') return [];
  const second = hex(c?.secondary_color);
  const third = second && hex(c?.tertiary_color);
  return [primary, second, third].filter((x): x is string => !!x);
}

function nameStyle(u: unknown, member: unknown, look: Look): { style: CSSProperties; className: string } {
  const picked = hex(own(look.resolve.users, obj(u as PreviewUser)?.id)?.color);
  const cs = picked ? [picked] : (rolesOf(member, look).map(({ r }) => roleColours(r)).find((c) => c.length) ?? []);
  if (cs.length < 2) return { style: { color: cs[0] ?? look.P.head }, className: '' };
  const stops = cs.length === 3 ? [...cs, cs[0]] : cs;
  return { style: { backgroundImage: `linear-gradient(to right, ${stops.join(', ')})` }, className: 'bg-clip-text text-transparent' };
}

function Name({ u, member, look, prefix = '', className }: { u: unknown; member?: unknown; look: Look; prefix?: string; className: string }) {
  const n = nameStyle(u, member, look);
  return (
    <span className={`${className} ${n.className}`} style={n.style}>
      {prefix + displayName(u, member, look)}
    </span>
  );
}

function RoleIcon({ member, look }: { member: unknown; look: Look }) {
  const top = rolesOf(member, look).find(({ id, r }) => (snowflake(id) && HASH.test(str(r.icon))) || str(r.unicode_emoji, 32));
  if (!top) return null;
  const name = str(top.r.name, 100);
  const id = snowflake(top.id);
  const icon = str(top.r.icon);
  if (id && HASH.test(icon)) return <img {...IMG} src={`https://cdn.discordapp.com/role-icons/${id}/${icon}.png?size=40`} alt={name} title={name} className="size-5 object-contain" />;
  return (
    <span className="text-base leading-none" title={name}>
      {str(top.r.unicode_emoji, 32)}
    </span>
  );
}

// The server tag chip, only while the user shows it.
function ServerTag({ u, look }: { u: PreviewUser | undefined; look: Look }) {
  const g = obj(u?.primary_guild);
  const tag = str(g?.tag, 4);
  if (g?.identity_enabled !== true || !tag) return null;
  const guild = snowflake(g.identity_guild_id);
  const badge = str(g.badge);
  return (
    <span className="inline-flex h-[18px] items-center gap-1 rounded-[4px] px-1 text-xs leading-none font-semibold" style={{ background: look.P.container, color: look.P.text }}>
      {guild && HASH.test(badge) && <img {...IMG} src={`https://cdn.discordapp.com/guild-tag-badges/${guild}/${badge}.png?size=16`} alt="" className="size-3.5" />}
      {tag}
    </span>
  );
}

const isApp = (m: PreviewMessage) => bool(obj(m.author)?.bot) || !!str(m.webhook_id);
const verified = (u: PreviewUser | undefined) => ((int(u?.public_flags) ?? 0) & VERIFIED_BOT) !== 0;

function AppTag({ check }: { check: boolean }) {
  return (
    <span className="inline-flex h-[15px] shrink-0 items-center rounded-[3px] px-1 text-[10px] leading-none font-semibold text-white" style={{ background: BLURPLE }}>
      {check && (
        // the check from skyra's discord-components verified-tick.tsx (MIT)
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 15.2" className="-ml-1">
          <path d="M7.4,11.17,4,8.62,5,7.26l2,1.53L10.64,4l1.36,1Z" fill="currentColor" />
        </svg>
      )}
      APP
    </span>
  );
}

export function Avatar({ m, look }: AreaProps) {
  const a = obj(m.author);
  const asset = str(obj(a?.avatar_decoration_data)?.asset);
  return (
    <span className="relative size-10 shrink-0 @max-[320px]:size-8">
      <img {...IMG} src={avatarSrc(a, look) ?? DEFAULT_AVATAR} alt="" className="size-full rounded-full" />
      {HASH.test(asset) && <img {...IMG} src={`https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=96`} alt="" className="pointer-events-none absolute top-[-10%] left-[-10%] size-[120%] max-w-none" />}
    </span>
  );
}

// "Today at 16:20" on the day of `now` in the preview's time zone, else a short date and time.
function headerTime(ms: number, look: Look) {
  const day = (t: number) => dateText(t, { dateStyle: 'short' }, look);
  const today = day(ms);
  return today && today === day(look.now) ? `Today at ${dateText(ms, { timeStyle: 'short' }, look)}` : dateText(ms, { dateStyle: 'short', timeStyle: 'short' }, look);
}

// The line above the message: name, role icon, server tag, APP tag, time, and the "Sent silently" and "Read aloud" notes.
export function MessageHeader({ m, look }: AreaProps) {
  const { P, classic } = look;
  const a = obj(m.author);
  const sent = Date.parse(str(m.timestamp, 64));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Name u={a} member={m.member} look={look} className="font-semibold" />
      <RoleIcon member={m.member} look={look} />
      <ServerTag u={a} look={look} />
      {isApp(m) && <AppTag check={verified(a)} />}
      <span className="text-xs" style={{ color: P.muted }}>
        {headerTime(Number.isNaN(sent) ? look.now : sent, look)}
      </span>
      {hasFlag(m, SUPPRESS_NOTIFICATIONS) && (
        <span className="text-xs" style={{ color: P.muted }}>
          · Sent silently
        </span>
      )}
      {classic && bool(m.tts) && (
        <span className="text-xs" style={{ color: P.muted }}>
          · Read aloud
        </span>
      )}
    </div>
  );
}

// ---- Above the message: one line, joined to the avatar by the curved spine (measurements from skyra's discord-reply.css)

function Above({ look, children }: { look: Look; children: ReactNode }) {
  return (
    <div className="relative mb-1 ml-[54px] flex min-w-0 items-center gap-1 text-sm leading-[18px] whitespace-nowrap @max-[320px]:ml-[42px]" style={{ color: look.P.muted }}>
      <span aria-hidden className="absolute top-1/2 right-full bottom-[-2px] left-[-35px] mt-[-1px] mr-1 rounded-tl-md border-t-2 border-l-2 @max-[320px]:left-[-27px]" style={{ borderColor: look.P.sep }} />
      {children}
    </div>
  );
}

const Mini = ({ u, look }: { u: PreviewUser | undefined; look: Look }) => <img {...IMG} src={avatarSrc(u, look) ?? DEFAULT_AVATAR} alt="" className="size-4 shrink-0 rounded-full" />;

// The replied-to message, as one line: never more than a snippet of it.
export function ReplyHeader({ m, look }: AreaProps) {
  const ref = obj(m.message_reference);
  const type = int(m.type) ?? 0;
  if (hasFlag(m, IS_CROSSPOST) || (int(ref?.type) ?? 0) !== 0 || !((ref && type === 0) || type === 19)) return null;
  const note = (text: string) => (
    <Above look={look}>
      <span className="grid size-4 shrink-0 place-items-center rounded-full" style={{ background: look.P.embed }}>
        <Glyph d={REPLY} size={10} />
      </span>
      <span className="italic">{text}</span>
    </Above>
  );
  if (m.referenced_message === null) return note('Original message was deleted');
  const r = obj(m.referenced_message);
  if (!r) return note('Message could not be loaded');
  const a = obj(r.author);
  const content = str(r.content, 300).replace(/\s+/g, ' ').trim();
  return (
    <Above look={look}>
      <Mini u={a} look={look} />
      {isApp(r) && <AppTag check={verified(a)} />}
      <Name u={a} member={r.member} look={look} prefix="@" className="shrink-0 font-medium" />
      {content ? (
        <span className="min-w-0 truncate">{inline(content, { ...look, m: r })}</span>
      ) : arr(r.attachments).length || arr(r.embeds).length ? (
        <>
          <span className="italic">Click to see attachment</span>
          <Glyph d={IMAGE} size={18} />
        </>
      ) : (
        <span className="italic">Click to see original message</span>
      )}
    </Above>
  );
}

// "<user> used /command" above an interaction reply.
export function InteractionHeader({ m, look }: AreaProps) {
  const meta = obj(m.interaction_metadata);
  const old = obj(m.interaction);
  if (!meta && !old) return null;
  const u = obj(meta?.user) ?? obj(old?.user);
  const name = str(old?.name, 100) || str(meta?.name, 100);
  return (
    <Above look={look}>
      <Mini u={u} look={look} />
      <Name u={u} look={look} className="shrink-0 font-medium" />
      <span className="shrink-0">{name ? 'used' : 'used a command'}</span>
      {name && (
        <span className="min-w-0 truncate font-medium" style={{ color: LINK }}>
          {`/${name}`}
        </span>
      )}
    </Above>
  );
}

// A forwarded message's snapshot. Its parts never select, and a snapshot's own snapshots are never read.
export function Forwarded({ m, look }: AreaProps) {
  const ref = obj(m.message_reference);
  const snap = obj(obj(arr(m.message_snapshots, 1)[0])?.message);
  if (int(ref?.type) !== 1 || !snap) return null;
  const { P } = look;
  const inner: Look = { ...look, m: snap, classic: true, sel: () => ({}), ring: () => ({}) };
  const channel = str(own(look.resolve.channels, ref?.channel_id)?.name, 100);
  const sent = Date.parse(str(snap.timestamp, 64));
  const footer = [channel && `#${channel}`, Number.isNaN(sent) ? '' : headerTime(sent, look)].filter(Boolean).join(' • ');
  return (
    <div className="mt-1 flex flex-col gap-1 border-l-4 pl-3" style={{ borderColor: P.sep }}>
      <div className="flex items-center gap-1 text-sm italic" style={{ color: P.muted }}>
        <Glyph d={FORWARD} size={16} />
        Forwarded
      </div>
      <div className="flex flex-col gap-2">
        {str(snap.content) && <Markdown text={str(snap.content, 4000)} look={inner} />}
        {(hasFlag(snap, SUPPRESS_EMBEDS) ? [] : arr(snap.embeds, 10)).map((e, i) => (
          <Embed key={i} e={e} path={[1, i]} look={inner} />
        ))}
        <Attachments m={snap} look={inner} />
        <Stickers m={snap} look={inner} />
      </div>
      {footer && (
        <div className="text-xs" style={{ color: P.muted }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ---- In and under the body

export function Edited({ m, look }: AreaProps) {
  if (!str(m.edited_timestamp)) return null;
  return (
    <span className="ml-1 text-[10px]" style={{ color: look.P.muted }}>
      (edited)
    </span>
  );
}

// "<name> is thinking..." in place of a deferred reply's body.
export function Thinking({ m, look }: AreaProps) {
  return (
    <div className="mt-1 italic" style={{ color: look.P.muted }}>
      {`${displayName(m.author, m.member, look)} is thinking...`}
    </div>
  );
}

// Under an ephemeral message. Without `onDismiss` the dismiss control is only shown.
export function EphemeralNote({ look, onDismiss, className }: { look: Look; onDismiss?: () => void; className: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`} style={{ color: look.P.muted }}>
      <Icon name="eye" size={14} /> Only you can see this ·
      {onDismiss ? (
        <button type="button" className="text-[#00A8FC] hover:underline" onClick={onDismiss}>
          Dismiss message
        </button>
      ) : (
        <span className="text-[#00A8FC]">Dismiss message</span>
      )}
    </div>
  );
}

// The thread started from this message (box measurements from skyra's discord-thread.css).
export function ThreadPreview({ m, look }: AreaProps) {
  const t = obj(m.thread);
  if (!t) return null;
  const { P } = look;
  const n = int(t.message_count) ?? 0;
  const count = n > 0 ? `${n > 50 ? '50+' : n} Message${n === 1 ? '' : 's'}` : 'See Thread';
  return (
    <div className="mt-2 flex w-fit max-w-[480px] min-w-0 flex-col gap-0.5 rounded-lg p-2 text-sm leading-[18px]" style={{ background: P.embed }}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold" style={{ color: P.head }}>
          {str(t.name, 100) || 'Thread'}
        </span>
        <span className="shrink-0 font-semibold" style={{ color: LINK }}>
          {`${count} ›`}
        </span>
      </div>
      <div className="truncate" style={{ color: P.muted }}>
        There are no recent messages in this thread.
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { bool, int, obj, own, safeSrc, str } from './guard.ts';
import { type AreaProps, dateText, hex, IMG, type Look } from './shared.tsx';

const SUPPRESS_NOTIFICATIONS = 1 << 12;
const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

function avatarUrl({ m, look }: AreaProps) {
  const a = obj(m.author);
  const id = str(a?.id);
  const custom = str(own(look.resolve.users, id)?.avatar);
  if (custom) return safeSrc(custom, look.localMedia);
  const av = str(a?.avatar);
  if (/[/:]/.test(av)) return safeSrc(av, look.localMedia);
  if (/^\w+$/.test(av) && /^\d{1,20}$/.test(id)) return `https://cdn.discordapp.com/avatars/${id}/${av}.png?size=80`;
  return undefined;
}

export function Avatar(props: AreaProps) {
  return <img {...IMG} src={avatarUrl(props) ?? DEFAULT_AVATAR} alt="" className="size-10 shrink-0 rounded-full @max-[320px]:size-8" />;
}

// "Today at 16:20" on the day of `now` in the preview's time zone, else a short date and time.
function headerTime(ms: number, look: Look) {
  const day = (t: number) => dateText(t, { dateStyle: 'short' }, look);
  const today = day(ms);
  return today && today === day(look.now) ? `Today at ${dateText(ms, { timeStyle: 'short' }, look)}` : dateText(ms, { dateStyle: 'short', timeStyle: 'short' }, look);
}

// The line above the message: name, APP tag, time, and the "Sent silently" and "Read aloud" notes.
export function MessageHeader({ m, look }: AreaProps) {
  const { P, resolve, classic } = look;
  const a = obj(m.author);
  const user = own(resolve.users, a?.id);
  const name = str(user?.name, 100) || str(a?.global_name, 100) || str(a?.username, 100) || 'Unknown';
  const sent = Date.parse(str(m.timestamp));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold" style={{ color: hex(user?.color) ?? P.head }}>
        {name}
      </span>
      {bool(a?.bot) && (
        <span className="rounded px-1 text-[10px] font-semibold text-white" style={{ background: '#5865f2' }}>
          APP
        </span>
      )}
      <span className="text-xs" style={{ color: P.muted }}>
        {headerTime(Number.isNaN(sent) ? look.now : sent, look)}
      </span>
      {((int(m.flags) ?? 0) & SUPPRESS_NOTIFICATIONS) !== 0 && (
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

// Filled in by later work: the replied-to message above this one.
export function ReplyHeader(_: AreaProps): ReactNode {
  return null;
}

// Filled in by later work: "<user> used /command" above an interaction reply.
export function InteractionHeader(_: AreaProps): ReactNode {
  return null;
}

// Filled in by later work: a forwarded message's snapshot.
export function Forwarded(_: AreaProps): ReactNode {
  return null;
}

// Filled in by later work: the thread started from this message.
export function ThreadPreview(_: AreaProps): ReactNode {
  return null;
}

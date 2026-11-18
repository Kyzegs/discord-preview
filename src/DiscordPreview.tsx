import { type CSSProperties, useState } from 'react';
import { Attachments, Stickers } from './attachments.tsx';
import { Block, limitV2, Row } from './components.tsx';
import { Embed } from './embed.tsx';
import { arr, int, num, obj, own, str } from './guard.ts';
import { jumbo, Markdown } from './markdown.tsx';
import { Avatar, Edited, EphemeralNote, Forwarded, InteractionHeader, MessageHeader, ReplyHeader, ThreadPreview, Thinking } from './message.tsx';
import { Modal } from './modal.tsx';
import { PollCard } from './poll.tsx';
import { Reactions } from './reactions.tsx';
import { type Look, newBudget, PALETTES, type Theme } from './shared.tsx';
import { isSystemMessage, SystemMessage } from './system.tsx';
import type { Path, Pressed, PreviewComponent, PreviewEmbed, PreviewMessage, PreviewModal, PreviewProps } from './types.ts';

const SUPPRESS_EMBEDS = 1 << 2;
const EPHEMERAL = 1 << 6;
const LOADING = 1 << 7;
const IS_COMPONENTS_V2 = 1 << 15;

// A replica of a Discord message, rendered from a Discord API payload.
export function DiscordPreview({
  payload,
  modal,
  resolve,
  theme = 'dark',
  mobile,
  bare,
  channelName,
  interactive,
  selected,
  locale,
  timeZone,
  now,
  localMedia,
  twemoji,
  highlight,
  mediaUrl,
  onPress,
  onSelectBlock,
}: PreviewProps) {
  const [reply, setReply] = useState<string | null>(null);
  const m = budgeted(obj(payload) ?? {});
  const P = typeof theme === 'string' && Object.hasOwn(PALETTES, theme) ? PALETTES[theme as Theme] : PALETTES.dark;
  const picked = Array.isArray(selected) ? selected.join('.') : null;
  const look: Look = {
    P,
    text: 'message',
    m,
    resolve: obj(resolve) ?? {},
    now: num(now) ?? Date.now(), // the only clock read, so server and client render the same
    locale: str(locale) || undefined,
    timeZone: str(timeZone) || undefined,
    localMedia: localMedia === true,
    interactive: interactive !== false,
    twemoji: twemoji === true,
    // functions only, which no payload or JSON attribute can hold
    highlight: typeof highlight === 'function' ? highlight : undefined,
    mediaUrl: typeof mediaUrl === 'function' ? mediaUrl : undefined,
    budget: newBudget(),
    press: (c: Pressed) => {
      if (interactive === false) return;
      const answer = onPress?.(c);
      setReply(typeof answer === 'string' ? answer : null);
    },
    ring: (p: Path): CSSProperties => (picked !== null && p.join('.') === picked ? { boxShadow: '0 0 0 2px var(--dp-ring)', borderRadius: '6px' } : {}),
    sel: (p: Path) => (onSelectBlock ? { onClick: (e) => (e.stopPropagation(), onSelectBlock(p)), className: 'cursor-pointer' } : {}),
  };
  const md = budgetedModal(obj(modal));
  const channel = str(channelName, 100) || str(own(look.resolve.channels, m.channel_id)?.name, 100) || 'general';
  // The reply to a press: an ephemeral message from the same author, answering this one. Nothing in it selects.
  const answer: PreviewMessage | null = reply ? { author: m.author, member: m.member, webhook_id: m.webhook_id, type: 19, flags: EPHEMERAL, message_reference: {}, referenced_message: m, content: str(reply, 4000) } : null;

  return (
    <div className="discord-preview @container w-full overflow-hidden rounded-xl border" style={{ background: P.bg, borderColor: P.border, color: P.text, maxWidth: mobile ? '360px' : undefined }} aria-label="Message preview">
      {md ? (
        <Modal m={md} look={look} />
      ) : (
        <>
          {!bare && (
            <div className="flex h-11 items-center gap-1.5 border-b px-4 text-[15px] font-semibold" style={{ borderColor: P.border, color: P.head }}>
              <span className="text-[20px] font-normal" style={{ color: P.hash }} aria-hidden>
                #
              </span>
              {channel}
            </div>
          )}
          <div className="pb-4">
            <Message m={m} look={look} />
            {answer && <Message m={answer} look={{ ...look, m: answer, sel: () => ({}), ring: () => ({}) }} onDismiss={() => setReply(null)} />}
          </div>
        </>
      )}
    </div>
  );
}

// One message as Discord lays it out: 72px of gutter on the left (the avatar sits in it), 24px on the right, 17px above
// it as the first of a group, its text at 16px on 22px lines. Ephemeral ones are tinted, with a 2px bar at the left
// and the "Only you can see this" line last.
function Message({ m, look, onDismiss }: { m: PreviewMessage; look: Look; onDismiss?: () => void }) {
  const { sel, ring } = look;
  const flags = int(m.flags) ?? 0;
  const ephemeral = (flags & EPHEMERAL) !== 0;
  const rows = arr(m.components, 5).map((r, i) =>
    r?.type === 1 ? (
      <div key={i} {...sel([2, i])} style={ring([2, i])}>
        <Row row={r} look={look} />
      </div>
    ) : null,
  );
  return (
    <div
      className={`relative mt-[17px] py-[2px] pr-6 pl-[72px] text-[16px] leading-[22px] @max-[320px]:pr-3 @max-[320px]:pl-14 ${ephemeral ? 'bg-[rgb(78_98_235/0.05)] hover:bg-[rgb(88_98_245/0.1)]' : ''}`}
    >
      {ephemeral && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[#5865f2]" />}
      {/* an ephemeral message answers an interaction, which never pings: no "@" before the name */}
      <ReplyHeader m={m} look={look} at={!ephemeral} />
      <InteractionHeader m={m} look={look} />
      {isSystemMessage(m) ? (
        <SystemMessage m={m} look={look} />
      ) : (
        <>
          <MessageHeader m={m} look={look}>
            <Avatar m={m} look={look} />
          </MessageHeader>
          <Forwarded m={m} look={look} />
          {flags & LOADING ? (
            <Thinking m={m} look={look} />
          ) : (flags & IS_COMPONENTS_V2) === 0 ? (
            <>
              {str(m.content) && (
                // "(edited)" follows the last line of text, so that line and the markdown around it flow inline
                <div {...sel([0])} className={`${sel([0]).className ?? ''} ${str(m.edited_timestamp) ? '[&>div]:inline [&>div>div:last-child]:inline' : ''}`} style={ring([0])}>
                  <Markdown text={str(m.content, 4000)} look={look} jumbo={jumbo(str(m.content, 4000))} />
                  <Edited m={m} look={look} />
                </div>
              )}
              {/* embeds, files, poll and components: 4px apart, 2px under the text; rows of components 6px apart */}
              <div className="flex flex-col gap-1 pt-[2px] empty:hidden">
                {(flags & SUPPRESS_EMBEDS ? [] : arr(m.embeds, 10)).map((e, i) => (
                  <Embed key={i} e={e} path={[1, i]} look={look} />
                ))}
                <Attachments m={m} look={look} />
                <Stickers m={m} look={look} />
                {obj(m.poll) && (
                  <div {...sel([3])} style={ring([3])}>
                    <PollCard poll={m.poll} look={look} />
                  </div>
                )}
                {rows.some(Boolean) && <div className="flex flex-col gap-[6px]">{rows}</div>}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-[2px]">
              {limitV2(arr(m.components, 40)).map((c, i) => (
                <Block key={i} c={c} path={[i]} look={look} />
              ))}
            </div>
          )}
          <Reactions m={m} look={look} />
          <ThreadPreview m={m} look={look} />
          {ephemeral && <EphemeralNote look={look} onDismiss={onDismiss} />}
        </>
      )}
    </div>
  );
}

// ---- Discord's totals for one message's text: 4000 characters of content, 6000 across its embeds (author names,
// titles, descriptions, field names and values, footers together) and 4000 across a Components V2 message's text
// displays. Each field is cut, in the order it is drawn, to what is left of its total, and the rest isn't rendered. A
// forwarded snapshot and a modal get totals of their own. It runs on a copy of the payload at each render of the root,
// so a part that re-renders alone (a spoiler being opened) shows the same text, and both builds cut alike.

type Take = (v: unknown, max: number) => string;
function total(n: number): Take {
  let left = n;
  return (v, max) => {
    const s = str(v, Math.min(max, left));
    left -= s.length;
    return s;
  };
}

function cutEmbed(raw: PreviewEmbed | null | undefined, take: Take): PreviewEmbed | null | undefined {
  const e = obj(raw);
  if (!e) return raw;
  const author = obj(e.author);
  const footer = obj(e.footer);
  return {
    ...e,
    author: author && { ...author, name: take(author.name, 256) },
    title: take(e.title, 256),
    description: take(e.description, 4096),
    fields: arr(e.fields, 25).flatMap((f) => (obj(f) ? [{ ...f, name: take(f?.name, 256), value: take(f?.value, 1024) }] : [])),
    footer: footer && { ...footer, text: take(footer.text, 2048) },
  };
}

function cutDisplays(list: readonly (PreviewComponent | null | undefined)[] | undefined, take: Take, top: boolean): PreviewComponent[] {
  return arr(list, 40).map((raw) => {
    const c = obj(raw);
    if (c?.type === 10) return { ...c, content: take(c.content, 4000) };
    if (c?.type === 9) return { ...c, components: arr(c.components, 3).map((t) => (obj(t) ? { ...t, content: take(t?.content, 4000) } : t)) as typeof c.components };
    if (c?.type === 17 && top) return { ...c, components: cutDisplays(c.components, take, false) };
    return raw;
  }) as PreviewComponent[];
}

function budgeted(m: PreviewMessage, snapshots = true): PreviewMessage {
  const embeds = total(6000);
  const out: PreviewMessage = {
    ...m,
    content: total(4000)(m.content, 4000),
    embeds: arr(m.embeds, 10).map((e) => cutEmbed(e, embeds)) as PreviewEmbed[],
    components: cutDisplays(m.components, total(4000), true),
  };
  const snap = snapshots ? obj(obj(arr(m.message_snapshots, 1)[0])?.message) : undefined;
  if (snap) out.message_snapshots = [{ message: budgeted(snap, false) }];
  return out;
}

const budgetedModal = (md: PreviewModal | undefined): PreviewModal | undefined => md && { ...md, components: cutDisplays(md.components, total(4000), false) };

import { type CSSProperties, useState } from 'react';
import { Attachments, Stickers } from './attachments.tsx';
import { Block, limitV2, Row } from './components.tsx';
import { Embed } from './embed.tsx';
import { arr, int, num, obj, own, str } from './guard.ts';
import { Markdown } from './markdown.tsx';
import { Avatar, Forwarded, InteractionHeader, MessageHeader, ReplyHeader, ThreadPreview } from './message.tsx';
import { Modal } from './modal.tsx';
import { PollCard } from './poll.tsx';
import { Reactions } from './reactions.tsx';
import { Icon, type Look, PALETTES } from './shared.tsx';
import { isSystemMessage, SystemMessage } from './system.tsx';
import type { Path, Pressed, PreviewMessage, PreviewProps } from './types.ts';

const SUPPRESS_EMBEDS = 1 << 2;
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
  interactive = true,
  selected,
  locale,
  timeZone,
  now,
  localMedia,
  onPress,
  onSelectBlock,
}: PreviewProps) {
  const [reply, setReply] = useState<string | null>(null);
  const m: PreviewMessage = obj(payload) ?? {};
  const flags = int(m.flags) ?? 0;
  const classic = (flags & IS_COMPONENTS_V2) === 0;
  const P = PALETTES[theme === 'light' ? 'light' : 'dark'];
  const picked = Array.isArray(selected) ? selected.join('.') : null;
  const look: Look = {
    P,
    classic,
    m,
    resolve: obj(resolve) ?? {},
    now: num(now) ?? Date.now(), // the only clock read, so server and client render the same
    locale: str(locale) || undefined,
    timeZone: str(timeZone) || undefined,
    localMedia: localMedia === true,
    press: (c: Pressed) => {
      if (!interactive) return;
      const answer = onPress?.(c);
      setReply(typeof answer === 'string' ? answer : null);
    },
    ring: (p: Path): CSSProperties => (picked !== null && p.join('.') === picked ? { boxShadow: '0 0 0 2px var(--dp-ring)', borderRadius: '6px' } : {}),
    sel: (p: Path) => (onSelectBlock ? { onClick: (e) => (e.stopPropagation(), onSelectBlock(p)), className: 'cursor-pointer' } : {}),
  };
  const { sel, ring } = look;
  const md = obj(modal);
  const channel = str(channelName, 100) || str(own(look.resolve.channels, m.channel_id)?.name, 100) || 'general';

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
          <div className="px-4 pt-4 pb-5 @max-[320px]:px-3">
            <ReplyHeader m={m} look={look} />
            <InteractionHeader m={m} look={look} />
            {isSystemMessage(m) ? (
              <SystemMessage m={m} look={look} />
            ) : (
              <div className="flex gap-3.5 @max-[320px]:gap-2.5">
                <Avatar m={m} look={look} />
                <div className="min-w-0 flex-1">
                  <MessageHeader m={m} look={look} />
                  <Forwarded m={m} look={look} />
                  {classic ? (
                    <div className="mt-1 flex flex-col gap-2">
                      {str(m.content) && (
                        <div {...sel([0])} style={ring([0])}>
                          <Markdown text={str(m.content, 4000)} look={look} />
                        </div>
                      )}
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
                      {arr(m.components, 5).map((r, i) =>
                        r?.type === 1 ? (
                          <div key={i} {...sel([2, i])} style={ring([2, i])}>
                            <Row row={r} look={look} />
                          </div>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-col gap-3">
                      {limitV2(arr(m.components, 40)).map((c, i) => (
                        <Block key={i} c={c} path={[i]} look={look} />
                      ))}
                    </div>
                  )}
                  <Reactions m={m} look={look} />
                  <ThreadPreview m={m} look={look} />
                </div>
              </div>
            )}
          </div>
          {reply && (
            <div className="pr-4 pb-[18px] pl-[70px] text-[15px]">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: P.muted }}>
                <Icon name="eye" size={14} /> Only you can see this ·
                <button type="button" className="text-[#00A8FC] hover:underline" onClick={() => setReply(null)}>
                  Dismiss message
                </button>
              </div>
              {reply}
            </div>
          )}
        </>
      )}
    </div>
  );
}

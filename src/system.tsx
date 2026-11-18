import type { ReactNode } from 'react';
import { arr, int, obj, own, str } from './guard.ts';
import { type AreaProps, dateText, Emo, type Look } from './shared.tsx';
import type { PreviewEmbed, PreviewMessage, PreviewUser } from './types.ts';

// Message types the client draws itself, each with its icon and colour. Anything else (0, 19, 20, 23, unknown) is ordinary.
const GREEN = '#23A559';
const RED = '#F23F43';
const PINK = '#FF73FA';
const AMBER = '#F0B232';
const MUTED = 'muted';
const ICON_PATHS = {
  join: 'M5 12h14M13 6l6 6-6 6',
  leave: 'M19 12H5M11 6l-6 6 6 6',
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l-2 6 5 12 5-12-2-6',
  pin: 'M12 17v5M9 3h6l-1 6 3 4H7l3-4z',
  thread: 'M4 5h16v10H9l-5 4z',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  stage: 'M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4zM5 11a7 7 0 0 0 14 0M12 18v3',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  bag: 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0',
  poll: 'M5 20V10M12 20V4M19 20v-7',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  follow: 'M4 11a8 8 0 0 1 8 8M4 5a14 14 0 0 1 14 14M5 19h.01',
  discovery: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  invite: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M19 8v6M16 11h6',
  bot: 'M6 8h12v10H6zM12 8V4M9 12h.01M15 12h.01',
} as const;
type IconKey = keyof typeof ICON_PATHS;

// type -> [icon, colour]; the colour is a fixed value, 'muted' follows the palette.
const KINDS: Record<number, [IconKey, string]> = {
  1: ['join', GREEN],
  2: ['leave', RED],
  3: ['call', GREEN],
  4: ['edit', MUTED],
  5: ['edit', MUTED],
  6: ['pin', MUTED],
  7: ['join', GREEN],
  8: ['gem', PINK],
  9: ['gem', PINK],
  10: ['gem', PINK],
  11: ['gem', PINK],
  12: ['follow', MUTED],
  14: ['discovery', RED],
  15: ['discovery', GREEN],
  16: ['alert', AMBER],
  17: ['alert', AMBER],
  18: ['thread', MUTED],
  21: ['thread', MUTED],
  22: ['invite', MUTED],
  24: ['bot', MUTED],
  25: ['star', PINK],
  26: ['gem', PINK],
  27: ['stage', GREEN],
  28: ['stage', RED],
  29: ['stage', GREEN],
  31: ['stage', MUTED],
  32: ['gem', PINK],
  36: ['shield', AMBER],
  37: ['shield', MUTED],
  38: ['shield', RED],
  39: ['shield', MUTED],
  44: ['bag', GREEN],
  46: ['poll', MUTED],
};

const typeOf = (m: PreviewMessage) => int(m.type);
export function isSystemMessage(m: PreviewMessage): boolean {
  const t = typeOf(m);
  return t !== undefined && Object.hasOwn(KINDS, t);
}

// The client's welcome sentences; the one shown is picked from the message time so a message never changes.
const WELCOMES: ((n: ReactNode) => ReactNode)[] = [
  (n) => <>{n} joined the party.</>,
  (n) => <>{n} is here.</>,
  (n) => <>Welcome, {n}. We hope you brought pizza.</>,
  (n) => <>A wild {n} appeared.</>,
  (n) => <>{n} just landed.</>,
  (n) => <>{n} just slid into the server.</>,
  (n) => <>{n} just showed up!</>,
  (n) => <>Welcome {n}. Say hi!</>,
  (n) => <>{n} hopped into the server.</>,
  (n) => <>Everyone welcome {n}!</>,
  (n) => <>Glad you're here, {n}.</>,
  (n) => <>Good to see you, {n}.</>,
  (n) => <>Yay you made it, {n}!</>,
];
export const welcomeIndex = (ms: number) => (Number.isFinite(ms) ? ((Math.trunc(ms) % WELCOMES.length) + WELCOMES.length) % WELCOMES.length : 0);

const userName = (u: PreviewUser | undefined, look: Look) =>
  str(own(look.resolve.users, u?.id)?.name, 100) || str(obj(u?.member)?.nick, 100) || str(u?.global_name, 100) || str(u?.username, 100) || 'Unknown';

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
// "a few seconds", "5 minutes", "2 hours", "3 days"
function span(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'a few seconds';
  if (min < 60) return plural(min, 'minute');
  if (min < 1440) return plural(Math.floor(min / 60), 'hour');
  return plural(Math.min(Math.floor(min / 1440), 9999), 'day');
}

const whole = (v: string) => (v.trim() ? int(Number(v)) : undefined);
const count = (v: string) => {
  const n = whole(v);
  return n !== undefined && n > 0 && n < 100_000 ? n : undefined;
};
const embedField = (e: PreviewEmbed | null | undefined, key: string) => str(arr(obj(e)?.fields, 25).find((f) => f?.name === key)?.value, 1000);
const embedOf = (m: PreviewMessage, type: string) => arr(m.embeds, 10).find((e) => obj(e)?.type === type) ?? undefined;

// "Today at 4:20 PM" on the day of `now`, else a short date and time.
function when(ms: number, look: Look) {
  const day = (t: number) => dateText(t, { dateStyle: 'short' }, look);
  const d = day(ms);
  return d && d === day(look.now) ? `Today at ${dateText(ms, { timeStyle: 'short' }, look)}` : dateText(ms, { dateStyle: 'short', timeStyle: 'short' }, look);
}

function Card({ look, children }: { look: Look; children: ReactNode }) {
  return (
    <div className="mt-1.5 max-w-[432px] rounded border-l-4 px-3 py-2 text-sm" style={{ background: look.P.embed, borderColor: look.P.sep, color: look.P.text }}>
      {children}
    </div>
  );
}

export function SystemMessage({ m, look }: AreaProps) {
  const { P, resolve } = look;
  const t = typeOf(m) ?? 0;
  const kind = Object.hasOwn(KINDS, t) ? KINDS[t] : undefined;
  if (!kind) return null;
  const strong = (s: ReactNode) => (
    <b className="font-medium" style={{ color: P.head }}>
      {s}
    </b>
  );
  const author = strong(userName(obj(m.author), look));
  const target = strong(userName(obj(arr(m.mentions, 5)[0]), look));
  const content = str(m.content, 200);
  const server = 'This server';
  const sent = Date.parse(str(m.timestamp, 64));
  const ts = Number.isNaN(sent) ? look.now : sent;
  const boosts = count(content);
  const boosted = (
    <>
      {author} just boosted the server{boosts && boosts > 1 ? ` ${boosts} times` : ''}!
    </>
  );
  let card: ReactNode = null;
  let line: ReactNode = null;

  switch (t) {
    case 1: line = <>{author} added {target} to the group.</>; break;
    case 2: line = <>{author} removed {target} from the group.</>; break;
    case 3: {
      const end = Date.parse(str(obj(m.call)?.ended_timestamp, 64));
      line = Number.isNaN(end) || end < ts ? <>{author} started a call.</> : <>{author} started a call that lasted {span(end - ts)}.</>;
      break;
    }
    case 4: line = <>{author} changed the channel name: {strong(content)}</>; break;
    case 5: line = <>{author} changed the group icon.</>; break;
    case 6: line = <>{author} pinned a message to this channel. See all pinned messages.</>; break;
    case 7: line = WELCOMES[welcomeIndex(ts)]!(author); break;
    case 8: line = boosted; break;
    case 9: case 10: case 11: line = <>{boosted} {server} has achieved {strong(`Level ${t - 8}`)}!</>; break;
    case 12: line = <>{author} has added {strong(content)} to this channel. Its most important updates will show up here.</>; break;
    case 14: line = <>{server} has been removed from Server Discovery because it no longer passes all the requirements. Check Server Settings for more details.</>; break;
    case 15: line = <>{server} has met all Discovery requirements again and has been re-added to Server Discovery.</>; break;
    case 16: line = <>{server} has failed Discovery requirements for 1 week. If this server fails to meet the requirements for 3 more weeks, it will be removed from Discovery.</>; break;
    case 17: line = <>{server} has failed Discovery requirements for 3 weeks. If this server fails to meet the requirements for 1 more week, it will be removed from Discovery.</>; break;
    case 18: line = <>{author} started a thread: {strong(content)}. See all threads.</>; break;
    case 21: {
      const ref = obj(m.referenced_message);
      line = ref ? <>{author} started a thread.</> : <>Sorry, we couldn't load the first message in this thread</>;
      if (ref)
        card = (
          <Card look={look}>
            <div className="font-medium" style={{ color: P.head }}>{userName(obj(ref.author), look)}</div>
            <div className="break-words whitespace-pre-wrap">{str(ref.content, 300)}</div>
          </Card>
        );
      break;
    }
    case 22: line = <>Making sure you've invited everyone you need? Invite more people to this server.</>; break;
    case 24: {
      const e = embedOf(m, 'auto_moderation_message');
      const channel = str(own(resolve.channels, embedField(e, 'channel_id'))?.name, 100);
      const rule = embedField(e, 'rule_name');
      const keyword = embedField(e, 'keyword');
      line = <>{author} flagged a message{channel ? <> in {strong(`#${channel}`)}</> : null}</>;
      card = (
        <Card look={look}>
          <div className="break-words whitespace-pre-wrap">{str(obj(e)?.description, 300)}</div>
          {(rule || keyword) && (
            <div className="mt-1 text-xs" style={{ color: P.muted }}>
              {rule && <>Rule: {rule}</>}
              {rule && keyword && ' · '}
              {keyword && <>Keyword: {keyword}</>}
            </div>
          )}
        </Card>
      );
      break;
    }
    case 25: {
      const d = obj(m.role_subscription_data);
      const months = int(d?.total_months_subscribed);
      const tier = str(d?.tier_name, 100);
      line = (
        <>
          {author} {d?.is_renewal === true ? 'renewed' : 'joined'} {tier ? strong(tier) : 'a tier'}
          {months !== undefined && months > 0 && months < 10_000 ? <> and has been a subscriber of this server for {plural(months, 'month')}</> : null}!
        </>
      );
      break;
    }
    case 26: line = <>{author} used a command that requires a premium subscription.</>; break;
    case 27: line = <>{author} started {strong(content)}</>; break;
    case 28: line = <>{author} ended {strong(content)}</>; break;
    case 29: line = <>{author} is now a speaker.</>; break;
    case 31: line = <>{author} changed the Stage topic: {strong(content)}</>; break;
    case 32: line = <>{author} upgraded {content ? strong(content) : 'this server'} to premium for this server!</>; break;
    case 36: line = <>{author} enabled security actions.</>; break;
    case 37: line = <>{author} disabled security actions.</>; break;
    case 38: line = <>{author} reported a raid in this server.</>; break;
    case 39: line = <>{author} resolved an Activity Alert as a false alarm.</>; break;
    case 44: {
      const name = str(obj(obj(m.purchase_notification)?.guild_product_purchase)?.product_name, 100);
      line = <>{author} has purchased {name ? strong(name) : 'a product'}!</>;
      break;
    }
    case 46: {
      const e = embedOf(m, 'poll_result');
      const answer = embedField(e, 'victor_answer_text');
      const votes = whole(embedField(e, 'victor_answer_votes'));
      const total = whole(embedField(e, 'total_votes'));
      const pct = votes !== undefined && total !== undefined && total > 0 && votes >= 0 ? Math.min(100, Math.round((votes / total) * 100)) : undefined;
      const emoji = { id: embedField(e, 'victor_answer_emoji_id') || null, name: embedField(e, 'victor_answer_emoji_name'), animated: embedField(e, 'victor_answer_emoji_animated') === 'true' };
      line = <>{author}'s poll {strong(embedField(e, 'poll_question_text'))} has closed</>;
      card = (
        <Card look={look}>
          {answer ? (
            <>
              <div className="flex items-center gap-1.5 font-medium" style={{ color: P.head }}>
                <Emo e={emoji} /> {answer}
              </div>
              {pct !== undefined && (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: P.sep }}>
                    <div className="h-full rounded-full" style={{ background: GREEN, width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs" style={{ color: P.muted }}>
                    {plural(votes!, 'vote')} · {pct}%
                  </div>
                </>
              )}
            </>
          ) : (
            'The poll received no votes.'
          )}
        </Card>
      );
      break;
    }
  }

  return (
    <div className="flex gap-3.5 @max-[320px]:gap-2.5" data-system-type={t}>
      <div className="mt-0.5 flex w-10 shrink-0 justify-center @max-[320px]:w-8" style={{ color: kind[1] === MUTED ? P.muted : kind[1] }}>
        <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={ICON_PATHS[kind[0]]} />
        </svg>
      </div>
      <div className="min-w-0 flex-1 break-words">
        <span style={{ color: P.muted }}>
          {line}
          <span className="ml-1 text-xs">{when(ts, look)}</span>
        </span>
        {card}
      </div>
    </div>
  );
}

import { type CSSProperties, type ReactNode, useState } from 'react';
import { Mosaic } from './attachments.tsx';
import { arr, bool, int, LOOKUP, num, obj, own, safeHref, safeSrc, str } from './guard.ts';
import { Markdown } from './markdown.tsx';
import { DEFAULT_AVATAR, Emo, fileSize, hex, Icon, type IconName, IMG, type Look, mediaSrc, PALETTES, Spoiler, Thumb } from './shared.tsx';
import type { DiscordOption, Path, PreviewActionRow, PreviewAutoSelect, PreviewButton, PreviewComponent, PreviewStringSelect } from './types.ts';

type Maybe<T> = T | null | undefined;

const TOP_LEVEL = new Set([1, 9, 10, 12, 13, 14, 17]);
const MAX_V2 = 40;

// Discord's shape for a Components V2 message: at most 40 components counting nested ones (depth first), and a
// container only at the top level. What doesn't fit becomes null, so every kept block keeps its index path.
export function limitV2(list: readonly Maybe<PreviewComponent>[]): (PreviewComponent | null)[] {
  let left = MAX_V2;
  const count = <T,>(x: Maybe<T>): T | null => (x !== null && typeof x === 'object' && left-- > 0 ? x : null);
  const fit = (raw: Maybe<PreviewComponent>, nested: boolean): PreviewComponent | null => {
    const c = obj(raw);
    if (!c || !TOP_LEVEL.has(c.type) || (nested && c.type === 17) || left <= 0) return null;
    left--;
    if (c.type === 17) return { ...c, components: arr(c.components, MAX_V2).map((x) => fit(x, true)) as PreviewComponent[] };
    if (c.type === 9) return { ...c, components: arr(c.components, 3).map(count) as typeof c.components, accessory: count(c.accessory) ?? undefined };
    if (c.type === 1) return { ...c, components: arr(c.components, 5).map(count) as typeof c.components };
    return c;
  };
  return list.map((x) => fit(x, false));
}

// Components V2: one block per component, nested by index path. A container holds no other container.
export function Block({ c: raw, path, look, nested = false }: { c: Maybe<PreviewComponent>; path: Path; look: Look; nested?: boolean }): ReactNode {
  const { P, sel, ring } = look;
  const c = obj(raw);
  if (!c) return null;
  const wrap = (node: ReactNode) => (
    <div {...sel(path)} style={ring(path)}>
      {node}
    </div>
  );
  switch (c.type) {
    case 10:
      return wrap(<Markdown text={c.content} look={look} />);
    case 17: {
      if (nested) return null;
      // it shrinks to its content; the accent is a 4px bar inside the left edge, clipped by the corners
      const accent = hex(c.accent_color);
      const inner: Look = { ...look, text: 'container' };
      return (
        <div {...sel(path)} className={`relative flex w-fit max-w-[min(520px,100%)] flex-col gap-2 overflow-hidden rounded-lg border p-4 ${sel(path).className ?? ''}`} style={{ background: P.embed, borderColor: P.embedLine, ...ring(path) }}>
          {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />}
          <Spoiler on={bool(c.spoiler)}>
            {arr(c.components, MAX_V2).map((x, i) => (
              <Block key={i} c={x} path={[...path, i]} look={inner} nested />
            ))}
          </Spoiler>
        </div>
      );
    }
    case 9: {
      const acc = obj(c.accessory);
      return wrap(
        <div className="flex gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {arr(c.components, 3).map((t, i) => (obj(t) ? <Markdown key={i} text={t?.content} look={look} /> : null))}
          </div>
          {acc?.type === 11 ? (
            <Spoiler on={bool(acc.spoiler)}>
              <Thumb url={obj(acc.media)?.url} alt={acc.description} look={look} />
            </Spoiler>
          ) : acc?.type === 2 ? (
            <Btn b={acc} look={look} />
          ) : null}
        </div>,
      );
    }
    case 14:
      // small spacing is the stack's own 8px gap on each side; large adds 8px more (not measured)
      return wrap(<div className={c.spacing === 2 ? 'py-2' : undefined}>{c.divider !== false && <div className="border-b" style={{ borderColor: P.divider }} />}</div>);
    case 12: {
      // the same mosaic as a message's attachments; in a container its cells are 128px squares
      const items = arr(c.items, 10).flatMap((it) => {
        const media = obj(it?.media);
        return it ? [{ url: media?.url, alt: it.description, spoiler: bool(it.spoiler), width: media?.width, height: media?.height }] : [];
      });
      return wrap(<Mosaic items={items} look={look} cell={nested ? 128 : undefined} />);
    }
    case 13: {
      const url = str(obj(c.file)?.url, 2048);
      const name = url.startsWith('attachment://') ? url.slice('attachment://'.length) : '';
      const att = name ? obj(arr(look.m.attachments, 10).find((a) => obj(a)?.filename === name)) : undefined;
      const size = num(att?.size) ?? num(c.size);
      return wrap(
        <Spoiler on={bool(c.spoiler)}>
          <div className="flex max-w-[432px] items-center gap-3 rounded-lg border p-4" style={{ background: P.embed, borderColor: P.sep }}>
            <span className="flex" style={{ color: P.link }}>
              <Icon name="file" size={30} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base leading-5" style={{ color: P.link }}>
                {str(att?.filename, 1024) || str(c.name, 1024) || name || 'file'}
              </div>
              {size !== undefined && size >= 0 && (
                <div className="text-xs" style={{ color: P.muted }}>
                  {fileSize(size)}
                </div>
              )}
            </div>
            <Icon name="download" size={20} className="opacity-70" />
          </div>
        </Spoiler>,
      );
    }
    case 1:
      return wrap(<Row row={c} look={look} />);
  }
  return null;
}

// The icon Discord puts before a channel of this type: voice and stage, announcement, forum and media, category, else #.
const channelIcon = (t: number): IconName => (t === 2 || t === 13 ? 'voice' : t === 5 ? 'megaphone' : t === 15 || t === 16 ? 'forum' : t === 4 ? 'folder' : 'hash');

// ---- Buttons

// The colours of primary (and its hover), success, danger and premium, the same in every theme; secondary and link
// take the palette's.
const SOLID: Record<number, string> = { 1: 'bg-[#5865f2] enabled:hover:bg-[#4452bb]', 3: 'bg-[#008545]', 4: 'bg-[#d22d39]', 6: 'bg-[#5865f2]' };

export function Btn({ b, look }: { b: PreviewButton; look: Look }) {
  const { P } = look;
  const style = int(b.style) ?? 0;
  const sku = style === 6 ? own(look.resolve.skus, b.sku_id) : undefined;
  const label = style === 6 ? (sku ? [str(sku.name, 100), str(sku.price, 100)].filter(Boolean).join(' · ') : 'Item name and price') : str(b.label, 80);
  const solid = SOLID[style];
  return (
    <button
      type="button"
      // the host gets the link only when it is a safe one, so a handler that opens it can't run javascript:
      onClick={() => look.press(b.url === undefined ? b : { ...b, url: safeHref(b.url) })}
      disabled={bool(b.disabled)}
      className={`inline-flex h-8 max-w-full min-w-[60px] shrink-0 items-center justify-center gap-1 rounded-lg border px-[11px] py-[3px] text-[14px] leading-[18px] font-medium [transition:background-color_.17s,color_.17s] disabled:cursor-not-allowed disabled:opacity-50 ${solid ? `border-[rgb(255_255_255/0.08)] text-white ${solid}` : ''}`}
      style={solid ? undefined : { background: P.secondary, borderColor: P.secondaryLine, color: P.secondaryText }}
    >
      <Emo e={b.emoji} look={look} className="size-[1.375em]" />
      {style === 6 && <Icon name="bag" size={14} />}
      {label && <span className="truncate">{label}</span>}
      {style === 5 && <Icon name="external" size={16} className="ml-1" />}
    </button>
  );
}

// ---- Selects

const MAX_OPTIONS = 25;

// Up to `max` of a record's object entries that pass `keep`, without walking the rest.
function entries<T extends object>(rec: Record<string, T> | undefined, keep: (id: string, v: T) => boolean = () => true, max = Infinity) {
  const out: [string, T][] = [];
  const r = obj(rec);
  if (!r) return out;
  for (const id of Object.keys(r)) {
    if (out.length >= max) break;
    const v = obj(r[id]);
    if (v && keep(id, v)) out.push([id, v]);
  }
  return out;
}

type Named = { name?: unknown; avatar?: unknown; color?: unknown; type?: unknown };
const userOption = (id: string, u: Named, look: Look): DiscordOption => ({ value: id, label: str(u.name, 100) || id, avatar: mediaSrc(u.avatar, look) ?? mediaSrc(DEFAULT_AVATAR, look) });
// a role with no colour shows a grey dot
const roleOption = (id: string, r: Named, look: Look): DiscordOption => ({ value: id, label: `@${str(r.name, 100) || id}`, color: (int(r.color) ? hex(r.color) : undefined) ?? look.P.muted });
const channelOption = (id: string, ch: Named): DiscordOption => ({ value: id, label: str(ch.name, 100) || id, channelType: int(ch.type) ?? 0 });

// What Discord would list in a user, role or channel menu, from what `resolve` knows (25 at most, like Discord).
function autoOptions(c: PreviewAutoSelect, look: Look): DiscordOption[] {
  const { resolve } = look;
  const users = () => entries(resolve.users, undefined, MAX_OPTIONS).map(([id, u]) => userOption(id, u, look));
  const roles = () =>
    entries(resolve.roles, (id) => id !== resolve.guildId, LOOKUP)
      .sort(([, a], [, b]) => (num(b.position) ?? 0) - (num(a.position) ?? 0))
      .slice(0, MAX_OPTIONS)
      .map(([id, r]) => roleOption(id, r, look));
  if (c.type === 8) {
    const types = Array.isArray(c.channel_types) ? c.channel_types.slice(0, 25) : null;
    return entries(resolve.channels, (_, ch) => (types ? types.includes(ch.type as number) : ch.type !== 4), MAX_OPTIONS).map(([id, ch]) => channelOption(id, ch));
  }
  return c.type === 5 ? users() : c.type === 6 ? roles() : [...users(), ...roles()].slice(0, MAX_OPTIONS);
}

// A default value, looked up directly so it needn't be among the options shown.
function defaultOption(id: string, look: Look): DiscordOption {
  const u = own(look.resolve.users, id);
  if (u) return userOption(id, u, look);
  const r = own(look.resolve.roles, id);
  if (r) return roleOption(id, r, look);
  const ch = own(look.resolve.channels, id);
  return ch ? channelOption(id, ch) : { value: id, label: id };
}

// A message or modal select: its options, its defaults shown as chosen, and what the viewer picks kept locally.
export function SelectMenu({ c, look, modal = false }: { c: PreviewStringSelect | PreviewAutoSelect; look: Look; modal?: boolean }) {
  const [picked, setPicked] = useState<DiscordOption[] | null>(null);
  const raw = c.type === 3 ? arr(c.options, MAX_OPTIONS) : [];
  const options: DiscordOption[] =
    c.type === 3 ? raw.map((o) => ({ value: str(o?.value, 100), label: str(o?.label, 100), description: str(o?.description, 100) || undefined, emoji: obj(o?.emoji) })) : autoOptions(c, look);
  const max = Math.min(Math.max(int(c.max_values) ?? 1, 1), MAX_OPTIONS);
  const defaults = c.type === 3 ? options.filter((_, i) => raw[i]?.default === true) : arr(c.default_values, MAX_OPTIONS).map((d) => defaultOption(str(d?.id, 100), look));
  const chosen = picked ?? defaults.slice(0, max);
  const multi = max > 1;
  const placeholder = str(c.placeholder, 150);
  const kind = c.type;
  return (
    <Dropdown
      label={placeholder || 'Select menu'}
      placeholder={placeholder || 'Make a selection'}
      options={options}
      chosen={chosen}
      multi={multi}
      disabled={!modal && bool(c.disabled)}
      locked={!look.interactive}
      look={look}
      onPick={(o) => {
        setPicked(!multi ? [o] : chosen.some((x) => x.value === o.value) ? chosen.filter((x) => x.value !== o.value) : chosen.length < max ? [...chosen, o] : chosen);
        // a modal's select reports nothing until submit, which a preview never does
        if (!modal) look.press({ type: kind, custom_id: str(c.custom_id) || undefined, picked: o.label, value: o.value });
      }}
      style={{ '--dsel-bg': look.P.selectBg, '--dsel-line': look.P.selectLine, '--dsel-muted': look.P.placeholder, '--dsel-text': look.P.text } as CSSProperties}
    />
  );
}

const isSelect = (c: { type?: unknown } | undefined): c is PreviewStringSelect | PreviewAutoSelect => c?.type === 3 || c?.type === 5 || c?.type === 6 || c?.type === 7 || c?.type === 8;

// A select takes the whole row: Discord refuses a row with a select and anything else, so only the first select is drawn.
export function Row({ row, look }: { row: PreviewActionRow; look: Look }) {
  const list = arr(row.components, 5).map((raw) => obj(raw));
  const select = list.find(isSelect);
  return (
    <div className="flex flex-wrap gap-2">
      {select ? <SelectMenu c={select} look={look} /> : list.map((c, i) => (c?.type === 2 ? <Btn key={i} b={c} look={look} /> : null))}
    </div>
  );
}

// What goes before an option: a user's avatar, a role's dot, a channel's icon, or the option's emoji (`emoji` sizes it).
function Mark({ o, look, emoji, icon = 18 }: { o: DiscordOption; look?: Look; emoji: string; icon?: number }) {
  const avatar = safeSrc(o.avatar, true);
  if (avatar) return <img {...IMG} src={avatar} alt="" className="size-5 shrink-0 rounded-full" />;
  if (typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color)) return <span className="size-3 shrink-0 rounded-full" style={{ background: o.color }} />;
  if (typeof o.channelType === 'number') return <Icon name={channelIcon(o.channelType)} size={icon} />;
  return o.emoji ? <Emo e={o.emoji} look={look} className={emoji} /> : null;
}
const marked = (o: DiscordOption) => Boolean(o.emoji || o.avatar || o.color || typeof o.channelType === 'number');

// A Discord dropdown, with the emoji and the grey line under each option that a native select can't draw.
export function DiscordSelect({
  label,
  placeholder,
  options,
  value,
  onPick,
  disabled,
  style,
}: {
  label: string;
  placeholder: string;
  options: DiscordOption[];
  value?: string;
  onPick: (o: DiscordOption) => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const found = options.find((o) => o.value === value);
  return <Dropdown label={label} placeholder={placeholder} options={options} chosen={found ? [found] : []} multi={false} onPick={onPick} disabled={disabled} style={style} />;
}

// The open list's height: 56px an option, 282px at most, plus its 8px gap from the select.
const listHeight = (n: number) => Math.min(282, n * 56 + 2) + 8;

// The dropdown itself: one chosen option shown with its mark, several as chips, and a check after each chosen option.
// `locked` (a preview that isn't interactive) keeps it shut, without the disabled look.
function Dropdown({
  label,
  placeholder,
  options,
  chosen,
  multi,
  onPick,
  disabled,
  locked,
  look,
  style,
}: {
  label: string;
  placeholder: string;
  options: DiscordOption[];
  chosen: DiscordOption[];
  multi: boolean;
  onPick: (o: DiscordOption) => void;
  disabled?: boolean;
  locked?: boolean;
  look?: Look; // the preview's, for emoji (DiscordSelect has none)
  style?: CSSProperties;
}) {
  // '' shut, else the side the list opens on, chosen when it opens
  const [open, setOpen] = useState<'' | 'down' | 'up'>('');
  const first = chosen[0];
  const P = look?.P ?? PALETTES.dark;
  return (
    <div
      className="dsel"
      data-open={open !== ''}
      data-up={open === 'up' || undefined}
      style={style}
      // focus leaving the select (a click elsewhere, Tab past it) shuts it; preact/compat maps onBlur to focusout
      onBlur={(e) => open && !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen('')}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        setOpen('');
        e.currentTarget.querySelector<HTMLElement>('.dsel-b')?.focus();
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open !== ''}
        disabled={disabled}
        className="dsel-b disabled:cursor-not-allowed disabled:opacity-50"
        onClick={(e) => {
          if (locked) return;
          if (open) return setOpen('');
          // the list isn't laid out while shut, so its height comes from the option count
          const box = e.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - box.bottom;
          setOpen(below < listHeight(options.length) && box.top > below ? 'up' : 'down');
        }}
      >
        {!first ? (
          <span className="dsel-p">{placeholder}</span>
        ) : multi ? (
          <span className="flex flex-wrap gap-1">
            {chosen.map((o, i) => (
              <span key={i} className="inline-flex h-8 max-w-full items-center gap-2 rounded-[3px] px-2 py-1.5" style={{ background: P.chip, color: P.head }}>
                {marked(o) && <Mark o={o} look={look} emoji="size-4" />}
                <span className="truncate">{o.label}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {marked(first) && <Mark o={first} look={look} emoji="size-[22px]" />}
            <span className="truncate">{first.label}</span>
          </span>
        )}
        <Icon name="chevronDown" size={18} />
      </button>
      <div className="dsel-l" role="listbox" aria-label={label} aria-multiselectable={multi || undefined} style={{ background: P.popout, borderColor: P.popoutLine }}>
        {options.map((o, i) => {
          const on = chosen.some((x) => x.value === o.value);
          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={on}
              className={typeof o.channelType === 'number' ? 'dsel-o dsel-c' : 'dsel-o'}
              style={{ background: on ? P.picked : undefined, color: on ? P.head : P.muted }}
              onClick={() => {
                if (!multi) setOpen('');
                onPick(o);
              }}
            >
              {marked(o) && (
                <span className="e">
                  <Mark o={o} look={look} emoji="size-[22px]" icon={24} />
                </span>
              )}
              <span className="dsel-t">
                {o.label}
                {o.description && <small style={{ color: P.muted }}>{o.description}</small>}
              </span>
              {on && <Icon name="check" size={20} className="text-[#5865f2]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { type CSSProperties, type ReactNode, useState } from 'react';
import { Mosaic } from './attachments.tsx';
import { arr, bool, int, LOOKUP, num, obj, own, safeHref, safeSrc, str } from './guard.ts';
import { Markdown } from './markdown.tsx';
import { DEFAULT_AVATAR, Emo, fileSize, hex, Icon, type IconName, IMG, type Look, mediaSrc, Spoiler, Thumb } from './shared.tsx';
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
    case 17:
      if (nested) return null;
      return (
        <div {...sel(path)} className={`flex max-w-[520px] flex-col gap-3 rounded-lg px-4 py-3.5 ${sel(path).className ?? ''}`} style={{ background: P.container, borderLeft: hex(c.accent_color) ? `4px solid ${hex(c.accent_color)}` : undefined, ...ring(path) }}>
          <Spoiler on={bool(c.spoiler)}>
            {arr(c.components, MAX_V2).map((x, i) => (
              <Block key={i} c={x} path={[...path, i]} look={look} nested />
            ))}
          </Spoiler>
        </div>
      );
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
      return wrap(<div className={c.spacing === 2 ? 'py-3' : 'py-1'}>{c.divider !== false && <div className="h-px" style={{ background: P.sep }} />}</div>);
    case 12: {
      // the same mosaic as a message's attachments
      const items = arr(c.items, 10).flatMap((it) => {
        const media = obj(it?.media);
        return it ? [{ url: media?.url, alt: it.description, spoiler: bool(it.spoiler), width: media?.width, height: media?.height }] : [];
      });
      return wrap(<Mosaic items={items} look={look} />);
    }
    case 13: {
      const url = str(obj(c.file)?.url, 2048);
      const name = url.startsWith('attachment://') ? url.slice('attachment://'.length) : '';
      const att = name ? obj(arr(look.m.attachments, 10).find((a) => obj(a)?.filename === name)) : undefined;
      const size = num(att?.size) ?? num(c.size);
      return wrap(
        <Spoiler on={bool(c.spoiler)}>
          <div className="flex max-w-[432px] items-center gap-3 rounded-lg border p-4" style={{ background: P.embed, borderColor: P.sep }}>
            <Icon name="file" size={30} className="text-[#00A8FC]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base leading-5 text-[#00A8FC]">{str(att?.filename, 1024) || str(c.name, 1024) || name || 'file'}</div>
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

// The client's colours for primary, success, danger and premium; secondary and link take the palette's grey.
const BUTTON_BG: Record<number, string> = { 1: '#5865F2', 3: '#248046', 4: '#DA373C', 6: '#5865F2' };

export function Btn({ b, look }: { b: PreviewButton; look: Look }) {
  const style = int(b.style) ?? 0;
  const sku = style === 6 ? own(look.resolve.skus, b.sku_id) : undefined;
  const label = style === 6 ? (sku ? [str(sku.name, 100), str(sku.price, 100)].filter(Boolean).join(' · ') : 'Item name and price') : str(b.label, 80);
  return (
    <button
      type="button"
      // the host gets the link only when it is a safe one, so a handler that opens it can't run javascript:
      onClick={() => look.press(b.url === undefined ? b : { ...b, url: safeHref(b.url) })}
      disabled={bool(b.disabled)}
      className="inline-flex h-8 max-w-full min-w-[60px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm leading-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: BUTTON_BG[style] ?? look.P.secondary }}
    >
      <Emo e={b.emoji} look={look} />
      {style === 6 && <Icon name="bag" size={14} />}
      {label && <span className="truncate">{label}</span>}
      {style === 5 && <Icon name="external" size={13} />}
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
      style={{ '--dsel-bg': look.P.selectBg, '--dsel-line': look.P.selectBorder, '--dsel-muted': look.P.muted, '--dsel-text': look.P.text } as CSSProperties}
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

// What goes before an option: a user's avatar, a role's dot, a channel's icon, or the option's emoji.
function Mark({ o, look }: { o: DiscordOption; look?: Look }) {
  const avatar = safeSrc(o.avatar, true);
  if (avatar) return <img {...IMG} src={avatar} alt="" className="inline-block size-5 rounded-full align-middle" />;
  if (typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color)) return <span className="inline-block size-3 rounded-full align-middle" style={{ background: o.color }} />;
  if (typeof o.channelType === 'number') return <Icon name={channelIcon(o.channelType)} size={18} className="inline-block align-middle" />;
  return o.emoji ? <Emo e={o.emoji} look={look} /> : null;
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

// The dropdown itself: one chosen option shown with its mark, several as chips, and a tick box per option when several may be chosen.
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
          // shortcut: the list's height is estimated (it isn't laid out while shut), at about 48px an option
          const box = e.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - box.bottom;
          setOpen(below < options.length * 48 + 12 && box.top > below ? 'up' : 'down');
        }}
      >
        {!first ? (
          <span>{placeholder}</span>
        ) : multi ? (
          <span>
            <span className="flex flex-wrap gap-1">
              {chosen.map((o, i) => (
                <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-md bg-[rgb(128_128_128/0.24)] px-1.5 py-0.5" style={{ color: 'var(--dsel-text)' }}>
                  {marked(o) && <Mark o={o} look={look} />}
                  <span className="truncate">{o.label}</span>
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span style={{ color: 'var(--dsel-text)' }}>
            {marked(first) && (
              <span className="mr-2 inline-block align-middle">
                <Mark o={first} look={look} />
              </span>
            )}
            {first.label}
          </span>
        )}
        <Icon name="chevronDown" size={16} />
      </button>
      <div className="dsel-l" role="listbox" aria-label={label} aria-multiselectable={multi || undefined}>
        {options.map((o, i) => {
          const on = chosen.some((x) => x.value === o.value);
          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={on}
              className="dsel-o"
              onClick={() => {
                if (!multi) setOpen('');
                onPick(o);
              }}
            >
              {marked(o) && (
                <span className="e">
                  <Mark o={o} look={look} />
                </span>
              )}
              <span className="dsel-t">
                {o.label}
                {o.description && <small>{o.description}</small>}
              </span>
              {multi && <span className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-[#5865F2] bg-[#5865F2] text-white' : 'border-current'}`}>{on && <Icon name="check" size={14} stroke={3} />}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

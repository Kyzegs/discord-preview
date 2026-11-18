import { type CSSProperties, type ReactNode, useState } from 'react';
import { arr, bool, int, num, obj, own, safeHref, str } from './guard.ts';
import { Markdown } from './markdown.tsx';
import { Emo, hex, Icon, Img, type Look, Spoiler, Thumb } from './shared.tsx';
import type { DiscordOption, Path, PreviewActionRow, PreviewAutoSelect, PreviewButton, PreviewComponent, Resolve } from './types.ts';

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
              <Thumb url={obj(acc.media)?.url} look={look} />
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
      const items = arr(c.items, 10);
      return wrap(
        <div className={`grid max-w-[400px] gap-1 ${items.length > 1 ? 'grid-cols-2' : ''}`}>
          {items.map((it, i) => (
            <Spoiler key={i} on={bool(it?.spoiler)}>
              <Img url={obj(it?.media)?.url} alt={it?.description} look={look} className="max-h-60" />
            </Spoiler>
          ))}
        </div>,
      );
    }
    case 13:
      return wrap(
        <Spoiler on={bool(c.spoiler)}>
          <div className="flex max-w-[400px] items-center gap-3 rounded-lg border p-3" style={{ background: P.embed, borderColor: P.sep }}>
            <Icon name="clipboard" size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[#00A8FC]">{str(c.name, 1024) || str(obj(c.file)?.url, 2048).replace('attachment://', '') || 'file'}</div>
            </div>
            <Icon name="download" size={18} />
          </div>
        </Spoiler>,
      );
    case 1:
      return wrap(<Row row={c} look={look} />);
  }
  return null;
}

const BUTTON_BG: Record<number, string> = { 1: '#5865F2', 3: '#248046', 4: '#DA373C', 6: '#5865F2' };

export function Btn({ b, look }: { b: PreviewButton; look: Look }) {
  const style = int(b.style) ?? 0;
  const sku = style === 6 ? own(look.resolve.skus, b.sku_id) : undefined;
  return (
    <button
      type="button"
      // the host gets the link only when it is a safe one, so a handler that opens it can't run javascript:
      onClick={() => look.press(b.url === undefined ? b : { ...b, url: safeHref(b.url) })}
      disabled={bool(b.disabled)}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
      style={{ background: BUTTON_BG[style] ?? look.P.secondary }}
    >
      <Emo e={b.emoji} />
      {style === 6 ? (
        <>
          <Icon name="bag" size={14} /> {sku ? [str(sku.name, 100), str(sku.price, 100)].filter(Boolean).join(' · ') : 'Item name and price'}
        </>
      ) : (
        str(b.label, 80)
      )}
      {style === 5 && <Icon name="external" size={13} />}
    </button>
  );
}

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

const userLabel = (id: string, u: { name?: unknown }) => `@${str(u.name, 100) || id}`;
const channelLabel = (id: string, ch: { name?: unknown }) => `#${str(ch.name, 100) || id}`;

// What Discord would list in a user, role or channel menu, from what `resolve` knows (25 at most, like Discord).
function autoOptions(c: PreviewAutoSelect, { resolve }: Look): DiscordOption[] {
  const users = () => entries(resolve.users, undefined, MAX_OPTIONS).map(([id, u]) => ({ value: id, label: userLabel(id, u) }));
  const roles = () =>
    entries(resolve.roles, (id) => id !== resolve.guildId)
      .sort(([, a], [, b]) => (num(b.position) ?? 0) - (num(a.position) ?? 0))
      .slice(0, MAX_OPTIONS)
      .map(([id, r]) => ({ value: id, label: userLabel(id, r) }));
  if (c.type === 8) {
    const types = Array.isArray(c.channel_types) ? c.channel_types.slice(0, 25) : null;
    return entries(resolve.channels, (_, ch) => (types ? types.includes(ch.type as number) : ch.type !== 4), MAX_OPTIONS).map(([id, ch]) => ({ value: id, label: channelLabel(id, ch) }));
  }
  return c.type === 5 ? users() : c.type === 6 ? roles() : [...users(), ...roles()].slice(0, MAX_OPTIONS);
}

// A default value's label, looked up directly so it needn't be among the options shown.
function defaultLabel(id: string, resolve: Resolve) {
  const u = own(resolve.users, id) ?? own(resolve.roles, id);
  if (u) return userLabel(id, u);
  const ch = own(resolve.channels, id);
  return ch ? channelLabel(id, ch) : id;
}

export function Row({ row, look }: { row: PreviewActionRow; look: Look }) {
  return (
    <div className="flex flex-wrap gap-2">
      {arr(row.components, 5).map((raw, i) => {
        const c = obj(raw);
        if (c?.type === 2) return <Btn key={i} b={c} look={look} />;
        if (c?.type !== 3 && c?.type !== 5 && c?.type !== 6 && c?.type !== 7 && c?.type !== 8) return null;
        const kind = c.type;
        const options: DiscordOption[] =
          c.type === 3
            ? arr(c.options, MAX_OPTIONS).map((o) => ({ value: str(o?.value, 100), label: str(o?.label, 100), description: str(o?.description, 100) || undefined, emoji: obj(o?.emoji) }))
            : autoOptions(c, look);
        const picked =
          c.type === 3
            ? arr(c.options, MAX_OPTIONS).flatMap((o) => (o?.default === true ? [str(o.label, 100)] : []))
            : arr(c.default_values, MAX_OPTIONS).map((d) => defaultLabel(str(d?.id, 100), look.resolve));
        const placeholder = str(c.placeholder, 150);
        return (
          <DiscordSelect
            key={i}
            label={placeholder || 'Select menu'}
            placeholder={picked.join(', ') || placeholder || 'Make a selection'}
            options={options}
            disabled={bool(c.disabled)}
            onPick={(o) => look.press({ type: kind, custom_id: str(c.custom_id) || undefined, picked: o.label, value: o.value })}
            style={{ '--dsel-bg': look.P.selectBg, '--dsel-line': look.P.selectBorder, '--dsel-muted': look.P.muted, '--dsel-text': look.P.text } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

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
  const [open, setOpen] = useState(false);
  return (
    <div className="dsel" data-open={open} style={style}>
      <button type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} className="dsel-b disabled:opacity-50" onClick={() => setOpen(!open)}>
        <span>{options.find((o) => o.value === value)?.label ?? placeholder}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <div className="dsel-l" role="listbox" aria-label={label}>
        {options.map((o, i) => (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={o.value === value}
            className="dsel-o"
            onClick={() => {
              setOpen(false);
              onPick(o);
            }}
          >
            {o.emoji && (
              <span className="e">
                <Emo e={o.emoji} />
              </span>
            )}
            <span className="dsel-t">
              {o.label}
              {o.description && <small>{o.description}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

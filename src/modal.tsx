import { type ReactNode, useState } from 'react';
import { SelectMenu } from './components.tsx';
import { arr, bool, int, obj, str } from './guard.ts';
import { Markdown } from './markdown.tsx';
import { BUILD, Icon, type Look } from './shared.tsx';
import type { PreviewCheckbox, PreviewCheckboxGroup, PreviewFileUpload, PreviewLabel, PreviewModal, PreviewRadioGroup, PreviewTextInput } from './types.ts';

const MAX_TOP_LEVEL = 5; // Discord's limit of top-level components in a modal
const RED = '#F23F42';
const BRAND = '#5865F2';

type Child = NonNullable<PreviewLabel['component']>;

// Discord's modal window, shown instead of the message. Nothing in it can submit or navigate: no form, every button
// type="button", and text fields without a name.
export function Modal({ m, look }: { m: PreviewModal; look: Look }): ReactNode {
  const { P } = look;
  return (
    <div className="flex justify-center p-4 @max-[320px]:p-2" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div role="dialog" aria-label={str(m.title, 45) || 'Modal'} className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-lg shadow-lg" style={{ background: P.bg }}>
        <div className="flex items-start gap-2 p-4">
          <h2 className="min-w-0 flex-1 text-xl leading-6 font-semibold break-words" style={{ color: P.head }}>
            {str(m.title, 45)}
          </h2>
          <button type="button" aria-label="Close" className="shrink-0 opacity-80 hover:opacity-100" style={{ color: P.muted }}>
            <Icon name="x" size={24} />
          </button>
        </div>
        <div className="flex max-h-[560px] flex-col gap-5 overflow-y-auto px-4 pb-4">
          {arr(m.components, MAX_TOP_LEVEL).map((raw, i) => {
            const c = obj(raw);
            if (c?.type === 10) return <Markdown key={i} text={c.content} look={look} />;
            if (c?.type === 18) return <Field key={i} label={c.label} description={c.description} child={c.component} look={look} />;
            // the legacy form: an action row holding one text input that carries its own label
            const input = c?.type === 1 ? obj(arr(c.components, 1)[0]) : undefined;
            return input?.type === 4 ? <Field key={i} label={input.label} child={input} look={look} /> : null;
          })}
        </div>
        <div className="flex justify-end gap-2 p-4" style={{ background: P.embed }}>
          <button type="button" className="h-[38px] rounded-lg px-4 text-sm font-medium hover:underline" style={{ color: P.head }}>
            Cancel
          </button>
          <button type="button" className="h-[38px] min-w-[96px] rounded-lg px-4 text-sm font-medium text-white" style={{ background: BRAND }}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// A Label: its text, a red asterisk when the input is required (Discord's default), its description, then the input.
function Field({ label, description, child, look }: { label: unknown; description?: unknown; child: unknown; look: Look }) {
  const { P } = look;
  const c = obj(child as Child | undefined);
  if (!c) return null;
  const title = str(label, 45);
  const note = str(description, 100);
  if (c.type === 23) return <Checkbox c={c} title={title} note={note} look={look} />;
  const input =
    c.type === 4 ? (
      <TextInput c={c} label={title} look={look} />
    ) : c.type === 3 || c.type === 5 || c.type === 6 || c.type === 7 || c.type === 8 ? (
      <SelectMenu c={c} look={look} modal />
    ) : c.type === 19 ? (
      <FileUpload c={c} look={look} />
    ) : c.type === 21 || c.type === 22 ? (
      <Choices c={c} look={look} />
    ) : null;
  if (!input) return null;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-base leading-5 font-semibold" style={{ color: P.head }}>
          {title}
          {c.required !== false && <span style={{ color: RED }}> *</span>}
        </div>
        {note && (
          <div className="mt-1 text-sm" style={{ color: P.muted }}>
            {note}
          </div>
        )}
      </div>
      {input}
    </div>
  );
}

const clamp = (v: number | undefined, lo: number, hi: number) => (v === undefined ? undefined : Math.min(Math.max(v, lo), hi));

// Short (one line) or paragraph; a paragraph with a max_length counts down the characters left, like the client.
function TextInput({ c, label, look }: { c: PreviewTextInput; label: string; look: Look }) {
  const { P } = look;
  const max = clamp(int(c.max_length), 1, 4000);
  const [typed, setTyped] = useState<string | null>(null);
  const initial = str(c.value, max ?? 4000);
  const value = typed ?? initial;
  const field = {
    placeholder: str(c.placeholder, 100) || undefined,
    maxLength: max ?? 4000,
    readOnly: !look.interactive,
    'aria-label': label || undefined,
    style: { background: P.selectBg, borderColor: P.selectBorder, color: P.text },
  };
  const box = 'w-full rounded-lg border px-2.5 text-base outline-none';
  if (int(c.style) !== 2) return <input type="text" value={value} {...field} className={`${box} h-10`} onChange={(e) => setTyped(e.currentTarget.value.slice(0, max ?? 4000))} />;
  return (
    <div className="relative">
      {/* Uncontrolled, its first value written as the textarea's text either way. Preact replaces that text node when it
          sets defaultValue over server HTML, so it gets the text as a child; React wants defaultValue (children warn). */}
      <textarea rows={4} {...(BUILD.preact ? { children: initial } : { defaultValue: initial })} {...field} className={`${box} block resize-none pt-2.5 ${max ? 'pb-6' : 'pb-2.5'}`} onChange={(e) => setTyped(e.currentTarget.value.slice(0, max ?? 4000))} />
      {max && (
        <span className="absolute right-3 bottom-2 text-xs" style={{ color: P.muted }}>
          {max - value.length}
        </span>
      )}
    </div>
  );
}

// The drop zone; it opens no file picker, so nothing leaves the page.
function FileUpload({ c, look }: { c: PreviewFileUpload; look: Look }) {
  const { P } = look;
  const most = clamp(int(c.max_values), 1, 10) ?? 1;
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm" style={{ borderColor: P.sep, color: P.muted, background: P.selectBg }}>
      <Icon name="upload" size={24} />
      <span>
        Drag and drop or <span className="text-[#00A8FC]">browse</span> to upload
      </span>
      <span className="text-xs">{most > 1 ? `Up to ${most} files` : '1 file'}</span>
    </div>
  );
}

// A tick box (square) or radio dot (round), in the brand colour when on.
function Tick({ on, round, look }: { on: boolean; round: boolean; look: Look }) {
  return (
    <span className={`mt-px grid size-5 shrink-0 place-items-center border-2 text-white ${round ? 'rounded-full' : 'rounded-md'}`} style={{ borderColor: on ? BRAND : look.P.muted, background: on && !round ? BRAND : undefined }}>
      {on && (round ? <span className="size-2.5 rounded-full" style={{ background: BRAND }} /> : <Icon name="check" size={14} stroke={3} />)}
    </span>
  );
}

// A Radio Group (one choice) or Checkbox Group (up to max_values); defaults start chosen.
function Choices({ c, look }: { c: PreviewRadioGroup | PreviewCheckboxGroup; look: Look }) {
  const { P } = look;
  const [picked, setPicked] = useState<number[] | null>(null);
  const options = arr(c.options, 10).map((o) => ({ label: str(o?.label, 100), description: str(o?.description, 100), on: o?.default === true }));
  const multi = c.type === 22;
  const max = multi ? (clamp(int(c.max_values), 1, 10) ?? options.length) : 1;
  const chosen = picked ?? options.flatMap((o, i) => (o.on ? [i] : [])).slice(0, max);
  const toggle = (i: number) => {
    if (!look.interactive) return;
    setPicked(!multi ? [i] : chosen.includes(i) ? chosen.filter((x) => x !== i) : chosen.length < max ? [...chosen, i] : chosen);
  };
  return (
    <div role={multi ? 'group' : 'radiogroup'} className="flex flex-col gap-2">
      {options.map((o, i) => (
        <button key={i} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={chosen.includes(i)} onClick={() => toggle(i)} className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left" style={{ background: P.selectBg }}>
          <Tick on={chosen.includes(i)} round={!multi} look={look} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base leading-5 break-words" style={{ color: P.text }}>
              {o.label}
            </span>
            {o.description && (
              <span className="text-sm break-words" style={{ color: P.muted }}>
                {o.description}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

// A lone Checkbox sits beside its Label's text; it can't be required.
function Checkbox({ c, title, note, look }: { c: PreviewCheckbox; title: string; note: string; look: Look }) {
  const { P } = look;
  const [picked, setPicked] = useState<boolean | null>(null);
  const on = picked ?? bool(c.default);
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={() => look.interactive && setPicked(!on)} className="flex items-start gap-3 text-left">
      <Tick on={on} round={false} look={look} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base leading-5 font-semibold break-words" style={{ color: P.head }}>
          {title}
        </span>
        {note && (
          <span className="mt-1 text-sm" style={{ color: P.muted }}>
            {note}
          </span>
        )}
      </span>
    </button>
  );
}

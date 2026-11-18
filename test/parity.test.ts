import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscordPreview } from '../dist/react.js';
import { renderToString } from '../dist/server.js';
import { fixtures } from './fixtures.ts';

// The React build and the Preact build must give the same markup. Both are parsed and printed one way, which takes
// out only what changes nothing in the page:
// - attribute order, and the trailing `;` Preact writes after the last style declaration
// - React's `<!-- -->` text separators (comments are dropped and the text around them joined)
// - the `<link rel="preload" as="image">` hints React 19 adds for images
// Anything else (text, classes, style values, structure) is a bug to fix in the source.
interface Node {
  nodeName: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
}
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const attr = ({ name, value }: { name: string; value: string }) => (name === 'style' ? value.replace(/;\s*$/, '') : value);
function print(n: Node): string {
  if (n.nodeName === '#text') return esc(n.value ?? '');
  if (n.nodeName === '#comment') return '';
  const kids = (n.childNodes ?? []).map(print).join('');
  if (n.nodeName.startsWith('#')) return kids;
  if (n.nodeName === 'link' && n.attrs?.some((a) => a.name === 'rel' && a.value === 'preload')) return '';
  const attrs = [...(n.attrs ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ` ${a.name}="${esc(attr(a))}"`);
  return `<${n.nodeName}${attrs.join('')}>${kids}</${n.nodeName}>`;
}
export const canonical = (html: string) => print(parseFragment(html) as Node);

// Each fixture as given, and once more with the other theme, the mobile width, a selection ring, select handlers,
// Twemoji and a highlighter.
const highlight = (code: string, lang: string) => `<span class="hl-${lang}">${esc(code)}</span>`;
const variants = { plain: {}, styled: { theme: 'light', mobile: true, bare: true, selected: [0], onSelectBlock: () => {}, twemoji: true, highlight } } as const;

for (const { name, props: base } of fixtures) {
  for (const [variant, extra] of Object.entries(variants)) {
    test(`parity: ${name} (${variant})`, () => {
      const props = { ...base, ...extra, selected: 'selected' in extra ? [...extra.selected] : base.selected };
      const preact = renderToString(props);
      assert.equal(canonical(preact), canonical(renderToStaticMarkup(createElement(DiscordPreview, props))));
      assert.ok(!preact.includes('<!--'), 'the Preact build writes no comments');
    });
  }
}

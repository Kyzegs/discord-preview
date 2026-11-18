import '@kyzegs/discord-preview/element';
import '@kyzegs/discord-preview/style.css';
import type { PressDetail, PreviewProps } from '@kyzegs/discord-preview/element';
import { fixtureParam, names, propsFor, replyFor } from '../shared/protocol.ts';

const q = new URLSearchParams(location.search);
if (q.has('hostile')) await import('./hostile.css'); // Tailwind 4 plus unlayered global rules that fight the preview

function mount(host: HTMLElement, props: PreviewProps) {
  const el = document.createElement('discord-preview');
  Object.assign(el, props, { selectable: true });
  el.addEventListener('press', (e) => {
    const { component, reply } = (e as CustomEvent<PressDetail>).detail;
    reply(replyFor(component));
  });
  el.addEventListener('selectblock', (e) => void (el.selected = (e as CustomEvent<{ path: number[] }>).detail.path));
  host.append(el);
  return el;
}

const app = document.getElementById('app')!;
const name = fixtureParam();
if (name) {
  app.innerHTML = '<div class="wrap" id="preview"></div>';
  const el = mount(document.getElementById('preview')!, propsFor(name));
  (window as unknown as { __setProps: (p: Partial<PreviewProps>) => void }).__setProps = (p) => void Object.assign(el, p);
} else {
  // the playground: every fixture with its preview
  for (const n of names) {
    app.insertAdjacentHTML('beforeend', `<h2 style="color:#ccc;font:14px sans-serif;margin:16px 8px 4px"><a href="?fixture=${n}" style="color:#7af">${n}</a></h2><div class="wrap"></div>`);
    mount(app.lastElementChild as HTMLElement, propsFor(n));
  }
}

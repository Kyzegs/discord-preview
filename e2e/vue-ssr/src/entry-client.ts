import 'discord-preview/style.css';
import { createSSRApp } from 'vue';
import type { PreviewProps } from 'discord-preview/vue';
import { fixtureParam, propsFor } from '../../shared/protocol.ts';
import App from './App.vue';

const vm = createSSRApp(App, { initial: propsFor(fixtureParam() ?? 'classic/content') }).mount('#preview') as unknown as { set(p: Partial<PreviewProps>): void };
(window as unknown as { __setProps: unknown }).__setProps = vm.set;

import { renderToString } from 'vue/server-renderer';
import { createSSRApp } from 'vue';
import { propsFor } from '../../shared/protocol.ts';
import App from './App.vue';

export const render = (fixture: string) => renderToString(createSSRApp(App, { initial: propsFor(fixture) }));

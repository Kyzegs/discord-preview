import { mount } from 'svelte';
import { fixtureParam, propsFor } from '../shared/protocol.ts';
import App from './App.svelte';

mount(App, { target: document.getElementById('preview'), props: { initial: propsFor(fixtureParam() ?? 'classic/content') } });

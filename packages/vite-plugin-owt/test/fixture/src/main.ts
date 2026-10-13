import { mount } from 'owt';
// @ts-expect-error .owt modules are typed by the OWT TypeScript plugin
import { App } from './App.owt';

mount(App, { target: document.getElementById('app')! });

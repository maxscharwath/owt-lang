import { mount } from 'owt';
import { App } from './App.owt';

mount(App, {
  props: { title: 'Hello OWT' },
  target: document.getElementById('root')!,
});

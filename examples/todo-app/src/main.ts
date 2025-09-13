import { mount } from 'owt';
import { App } from './App.owt';
import './styles.css';

mount(App, {
  target: document.getElementById('app')!,
});

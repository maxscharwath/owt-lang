import { mount } from 'owt';
import { App } from './App.owt';
import './global.css';

mount(App, { target: document.getElementById('app')! });

import { mount } from 'owt/dom';
import { App } from './App.owt';
import './styles.css';

mount(App, { props: {}, target: document.getElementById('app')! });

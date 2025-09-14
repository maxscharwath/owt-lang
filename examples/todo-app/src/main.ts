import { mount, initDomHost } from 'owt/dom';
import { App } from './App.owt';
import './styles.css';

// Initialize DOM host
initDomHost();

mount(App, { props: {}, target: document.getElementById('app')! });

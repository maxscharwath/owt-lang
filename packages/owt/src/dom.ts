import {
  mount as runtimeMount,
  setDevLogger,
  devLog,
  domHost,
  setHost,
  type ComponentFn,
} from '@owt/runtime';

// Initialize DOM host
export function initDomHost() {
  setHost(domHost);
}

// Mount components and ensure the DOM host is ready
export function mount<P>(Component: ComponentFn<P>, options: { props?: P; target: HTMLElement }) {
  initDomHost();
  return runtimeMount(Component, options);
}

export { setDevLogger, devLog, domHost, setHost };



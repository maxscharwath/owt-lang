/** DOM entry point (kept for compatibility with `import { mount } from 'owt/dom'`). */
export { mount, unmount, Portal, type App, type Component, type MountOptions } from './dom/component';
export { tick, flushSync } from './reactivity';

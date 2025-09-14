export { mount } from '@owt/runtime';
export { setDevLogger, devLog } from '@owt/runtime';
export { domHost, setHost } from '@owt/runtime';

// Import locally for use in functions
import { setHost as _setHost, domHost as _domHost } from '@owt/runtime';

// Initialize DOM host
export function initDomHost() {
  _setHost(_domHost);
}



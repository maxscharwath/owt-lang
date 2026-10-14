/** HTML knowledge used by the template compiler. */

export const SVG_ELEMENTS = new Set([
  'svg',
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'set',
  'stop',
  'switch',
  'symbol',
  'text',
  'textPath',
  'tspan',
  'use',
  'view',
]);

export const MATHML_ELEMENTS = new Set([
  'math',
  'mi',
  'mn',
  'mo',
  'ms',
  'mspace',
  'mtext',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mpadded',
  'mphantom',
  'mroot',
  'mrow',
  'msqrt',
  'mstyle',
  'mmultiscripts',
  'mover',
  'mprescripts',
  'msub',
  'msubsup',
  'msup',
  'munder',
  'munderover',
  'mtable',
  'mtd',
  'mtr',
  'semantics',
  'annotation',
  'annotation-xml',
]);

/** Attributes whose presence means true. */
export const BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
  'webkitdirectory',
]);

/** Attributes set as DOM properties. */
export const DOM_PROPERTIES = new Set([
  'value',
  'checked',
  'selected',
  'muted',
  'indeterminate',
  'defaultValue',
  'defaultChecked',
  'innerHTML',
  'textContent',
  'innerText',
  'srcObject',
  'volume',
  'currentTime',
  'playbackRate',
  'scrollTop',
  'scrollLeft',
]);

/** `bind:x` → DOM property / event used for generic property bindings. */
export const PROPERTY_BINDINGS: Record<string, string> = {
  open: 'toggle',
  files: 'change',
  textContent: 'input',
  innerHTML: 'input',
  innerText: 'input',
  currentTime: 'timeupdate',
  volume: 'volumechange',
  muted: 'volumechange',
  playbackRate: 'ratechange',
  indeterminate: 'change',
};

export const SIZE_BINDINGS = new Set(['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']);

/** Elements in which whitespace is significant. */
export const PRESERVE_WHITESPACE = new Set(['pre', 'textarea']);

/** Block-level elements that implicitly close an open <p>. */
const CLOSES_P = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

/**
 * Nesting that the HTML parser would silently restructure (which would break
 * the compiled node paths). Returns an error message or null.
 */
export function invalidNesting(child: string, parent: string): string | null {
  if (parent === 'p' && CLOSES_P.has(child)) return `<${child}> cannot be placed inside <p> (the browser would close the paragraph)`;
  if (child === 'a' && parent === 'a') return '<a> cannot be placed inside another <a>';
  if (child === 'form' && parent === 'form') return '<form> cannot be placed inside another <form>';
  if (child === 'tr' && parent === 'table') return '<tr> must be inside <tbody>, <thead> or <tfoot> (the browser would insert <tbody>)';
  if ((child === 'td' || child === 'th') && parent !== 'tr') {
    if (parent === 'table' || parent === 'tbody' || parent === 'thead' || parent === 'tfoot') return `<${child}> must be inside <tr>`;
  }
  if (child === 'li' && parent === 'li') return '<li> cannot be placed directly inside another <li>';
  if (parent === 'select' && child !== 'option' && child !== 'optgroup' && child !== 'hr') return `<${child}> is not allowed inside <select>`;
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  para: '¶',
  sect: '§',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  check: '✓',
  hearts: '♥',
  star: '☆',
  thinsp: ' ',
  ensp: ' ',
  emsp: ' ',
  zwnj: '‌',
  zwj: '‍',
  shy: '­',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  micro: 'µ',
  infin: '∞',
  ne: '≠',
  le: '≤',
  ge: '≥',
  minus: '−',
};

function isAlnum(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/** Decode HTML character references (numeric and common named ones). */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const amp = text.indexOf('&', i);
    if (amp < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, amp);
    let j = amp + 1;
    let decoded: string | null = null;
    if (text[j] === '#') {
      j++;
      const hex = text[j] === 'x' || text[j] === 'X';
      if (hex) j++;
      const digitsStart = j;
      while (j < text.length && (hex ? isHex(text.charCodeAt(j)) : isAlnum(text.charCodeAt(j)) && text.charCodeAt(j) <= 57)) j++;
      if (j > digitsStart) {
        const code = Number.parseInt(text.slice(digitsStart, j), hex ? 16 : 10);
        if (Number.isFinite(code) && code <= 0x10ffff) decoded = String.fromCodePoint(code);
      }
    } else {
      while (j < text.length && isAlnum(text.charCodeAt(j))) j++;
      decoded = NAMED_ENTITIES[text.slice(amp + 1, j)] ?? null;
    }
    if (decoded !== null) {
      out += decoded;
      i = text[j] === ';' ? j + 1 : j;
    } else {
      out += '&';
      i = amp + 1;
    }
  }
  return out;
}

export function escapeAttribute(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ch === '"') out += '&quot;';
    else if (ch === '&') out += '&amp;';
    else out += ch;
  }
  return out;
}

/** Text that goes into template HTML (already entity-encoded source text is kept as written). */
export function escapeTemplateText(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ch === '<') out += '&lt;';
    else out += ch;
  }
  return out;
}

/** Escape plain (decoded) text for template HTML. */
export function escapeText(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ch === '<') out += '&lt;';
    else if (ch === '&') out += '&amp;';
    else out += ch;
  }
  return out;
}

function isBlank(c: string): boolean {
  return c === ' ' || c === '\t';
}

/**
 * JSX whitespace rules: lines are trimmed, blank lines dropped, remaining
 * lines joined with a single space. Text on a single line is kept as is.
 */
export function cleanText(raw: string): string {
  const normalized = raw.split('\r\n').join('\n').split('\r').join('\n');
  if (!normalized.includes('\n')) return normalized;
  const lines = normalized.split('\n');
  let lastNonEmpty = -1;
  lines.forEach((line, i) => {
    for (const ch of line) {
      if (!isBlank(ch)) {
        lastNonEmpty = i;
        break;
      }
    }
  });
  let out = '';
  lines.forEach((line, i) => {
    let l = line.split('\t').join(' ');
    if (i !== 0) {
      let k = 0;
      while (k < l.length && l[k] === ' ') k++;
      l = l.slice(k);
    }
    if (i !== lines.length - 1) {
      let k = l.length;
      while (k > 0 && l[k - 1] === ' ') k--;
      l = l.slice(0, k);
    }
    if (l) {
      if (i !== lastNonEmpty) l += ' ';
      out += l;
    }
  });
  return out;
}

/** Escape a string for use inside a JS template literal. */
export function templateLiteralText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '`' || ch === '\\') out += `\\${ch}`;
    else if (ch === '$' && value[i + 1] === '{') out += '\\$';
    else out += ch;
  }
  return out;
}

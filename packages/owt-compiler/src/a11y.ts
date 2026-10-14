/**
 * Accessibility checks, reported as warnings (like Svelte's a11y lints).
 *
 * `A11yChecker.check` runs once per HTML element, parents before their
 * content. Only static facts are checked: an attribute whose value is an
 * expression is assumed to be fine, and a spread attribute turns off the
 * checks that look for a missing attribute (the spread may provide it).
 * `<!-- owt-ignore a11y-... -->` before an element silences a warning (`ignore.ts`).
 */
import { walkTemplate, type Attribute, type Element, type Span, type TemplateNode } from '@owt/ast';
import { decodeEntities, splitTokens } from './html';
import { eventInfo, splitModifiers } from './modifiers';

export type A11yReporter = { warn(code: string, message: string, start: number, end: number): void };

type Warn = (code: string, message: string, at: Span) => void;

/** What a rule sees of the element being checked. */
type Check = { el: Element; attrs: Attributes; tag: Span; warn: Warn };

/** WAI-ARIA 1.2 states and properties (same list as `AriaAttributes` in `owt/elements`). */
const ARIA_ATTRIBUTES = new Set([
  'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-braillelabel', 'aria-brailleroledescription', 'aria-busy',
  'aria-checked', 'aria-colcount', 'aria-colindex', 'aria-colindextext', 'aria-colspan', 'aria-controls', 'aria-current',
  'aria-describedby', 'aria-description', 'aria-details', 'aria-disabled', 'aria-dropeffect', 'aria-errormessage', 'aria-expanded',
  'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid', 'aria-keyshortcuts', 'aria-label', 'aria-labelledby',
  'aria-level', 'aria-live', 'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-orientation', 'aria-owns', 'aria-placeholder',
  'aria-posinset', 'aria-pressed', 'aria-readonly', 'aria-relevant', 'aria-required', 'aria-roledescription', 'aria-rowcount',
  'aria-rowindex', 'aria-rowindextext', 'aria-rowspan', 'aria-selected', 'aria-setsize', 'aria-sort', 'aria-valuemax', 'aria-valuemin',
  'aria-valuenow', 'aria-valuetext',
]);

/** Concrete WAI-ARIA 1.2 roles, plus the DPUB-ARIA (`doc-*`) and Graphics-ARIA (`graphics-*`) modules. */
const ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code',
  'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis',
  'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem',
  'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none',
  'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader',
  'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch',
  'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
  'doc-abstract', 'doc-acknowledgments', 'doc-afterword', 'doc-appendix', 'doc-backlink', 'doc-biblioentry', 'doc-bibliography',
  'doc-biblioref', 'doc-chapter', 'doc-colophon', 'doc-conclusion', 'doc-cover', 'doc-credit', 'doc-credits', 'doc-dedication',
  'doc-endnote', 'doc-endnotes', 'doc-epigraph', 'doc-epilogue', 'doc-errata', 'doc-example', 'doc-footnote', 'doc-foreword',
  'doc-glossary', 'doc-glossref', 'doc-index', 'doc-introduction', 'doc-noteref', 'doc-notice', 'doc-pagebreak', 'doc-pagefooter',
  'doc-pageheader', 'doc-pagelist', 'doc-part', 'doc-preface', 'doc-prologue', 'doc-pullquote', 'doc-qna', 'doc-subtitle', 'doc-tip',
  'doc-toc', 'graphics-document', 'graphics-object', 'graphics-symbol',
]);

/** Abstract roles describe the ARIA taxonomy; elements must not use them. */
const ABSTRACT_ROLES = new Set(['command', 'composite', 'input', 'landmark', 'range', 'roletype', 'section', 'sectionhead', 'select', 'structure', 'widget', 'window']);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Elements that are keyboard-operable on their own (`a`, `area`, `audio`, `video` depend on attributes). */
const INTERACTIVE = new Set(['button', 'details', 'input', 'label', 'option', 'select', 'summary', 'textarea']);

/** Elements a `<label>` can be associated with. */
const LABELABLE = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);

const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

/** DOM properties and bindings that give an element its text content. */
const CONTENT_PROPERTIES = ['innerhtml', 'innertext', 'textcontent'];

/** Static text of an attribute value; null when it is computed at runtime. */
function staticValue(attr: Attribute): string | null {
  const value = attr.value;
  if (value.type === 'Boolean') return '';
  if (value.type === 'Static') return decodeEntities(value.value);
  const expr = value.expression;
  if (expr === null) return null;
  switch (expr.type) {
    case 'StringLiteral':
      return expr.value;
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return String(expr.value);
    case 'TemplateLiteral':
      return expr.expressions.length === 0 ? (expr.quasis[0]?.value.cooked ?? null) : null;
    default:
      return null;
  }
}

/** `title={null}` / `hidden={false}` render no attribute (`aria-*` / `data-*` render "false"). */
function rendersNothing(attr: Attribute, name: string): boolean {
  if (attr.value.type !== 'Expression' || attr.value.expression === null) return false;
  const expr = attr.value.expression;
  if (expr.type === 'NullLiteral') return true;
  return expr.type === 'BooleanLiteral' && !expr.value && !name.startsWith('aria-') && !name.startsWith('data-');
}

/** Event listened to by an attribute: `onClick`, `onClick|self`, `onClickCapture` and `on:click` → click. */
function eventType(attr: Attribute): string | null {
  if (attr.directive === 'on') return splitModifiers(attr.arg).name;
  if (attr.directive !== null) return null;
  return eventInfo(splitModifiers(attr.name).name)?.type ?? null;
}

/** An element's attributes by lower-case name (HTML names are case-insensitive; `htmlFor` means `for`). */
class Attributes {
  readonly spread: boolean;
  private readonly plain = new Map<string, Attribute>();
  /** attributes with a handler, by event type (`onClick|stopPropagation` alone has none) */
  private readonly listeners = new Map<string, Attribute>();
  /** `bind:x` targets */
  private readonly bindings = new Set<string>();

  constructor(el: Element) {
    let spread = false;
    for (const attr of el.attributes) {
      if (attr.type === 'SpreadAttribute') {
        spread = true;
        continue;
      }
      const event = eventType(attr);
      if (event !== null) {
        if (attr.value.type === 'Expression' && attr.value.expression !== null && !this.listeners.has(event)) this.listeners.set(event, attr);
        continue;
      }
      if (attr.directive === 'bind') this.bindings.add(attr.arg.toLowerCase());
      if (attr.directive !== null) continue;
      const lower = attr.name.toLowerCase();
      const name = lower === 'htmlfor' ? 'for' : lower;
      if (!rendersNothing(attr, name) && !this.plain.has(name)) this.plain.set(name, attr);
    }
    this.spread = spread;
  }

  has(name: string): boolean {
    return this.plain.has(name);
  }

  get(name: string): Attribute | undefined {
    return this.plain.get(name);
  }

  /** undefined: absent, null: dynamic, string: static value */
  value(name: string): string | null | undefined {
    const attr = this.plain.get(name);
    return attr === undefined ? undefined : staticValue(attr);
  }

  listener(type: string): Attribute | undefined {
    return this.listeners.get(type);
  }

  bound(name: string): boolean {
    return this.bindings.has(name);
  }

  /** `aria-hidden="true"` or `role="presentation"` / `role="none"`: not exposed as a control */
  hiddenOrPresentational(): boolean {
    const roles = splitTokens(this.value('role') ?? '').map((r) => r.toLowerCase());
    return this.value('aria-hidden') === 'true' || roles.includes('presentation') || roles.includes('none');
  }
}

/** Levenshtein distance between two names. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      row.push(Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, substitution));
    }
    previous = row;
  }
  return previous[b.length] ?? 0;
}

/** The closest candidate within two edits, for "Did you mean ...?" hints. */
function closest(name: string, candidates: Iterable<string>): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(name, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

function contains(nodes: readonly TemplateNode[], test: (el: Element) => boolean): boolean {
  let found = false;
  walkTemplate(nodes, (node) => {
    if (found) return false;
    if (node.type === 'Element' && test(node)) found = true;
  });
  return found;
}

/** Text, `{expressions}`, elements, components or blocks: anything but whitespace and comments. */
function hasContent(el: Element): boolean {
  return el.children.some((child) => {
    switch (child.type) {
      case 'Comment':
      case 'ValDecl':
        return false;
      case 'Text':
        return child.raw.trim() !== '';
      case 'ExpressionTag':
        return child.expression !== null;
      default:
        return true;
    }
  });
}

function isInteractive({ el, attrs }: Check): boolean {
  // custom elements can be controls of their own
  if (INTERACTIVE.has(el.name) || el.name.includes('-')) return true;
  if (el.name === 'a' || el.name === 'area') return attrs.has('href') || attrs.has('xlink:href');
  if (el.name === 'audio' || el.name === 'video') return attrs.has('controls');
  const editable = attrs.value('contenteditable');
  return editable !== undefined && editable !== 'false';
}

/** `<a>` that is neither a link nor a scroll target. */
function missingHref(attrs: Attributes): boolean {
  if (attrs.spread || attrs.has('href') || attrs.has('xlink:href') || attrs.has('id') || attrs.has('name')) return false;
  return attrs.value('aria-disabled') !== 'true';
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function checkAlt({ el, attrs, tag, warn }: Check): void {
  if (attrs.spread || attrs.has('alt')) return;
  if (el.name === 'img') {
    warn('a11y-missing-alt', '<img> needs an alt attribute: describe what the image shows, or use alt="" if it is decorative', tag);
    return;
  }
  const imageButton = el.name === 'input' && attrs.value('type')?.toLowerCase() === 'image';
  if ((el.name === 'area' || imageButton) && !attrs.has('aria-label') && !attrs.has('aria-labelledby')) {
    const what = imageButton ? '<input type="image"> needs an alt attribute describing what the button does' : '<area> needs an alt attribute describing where the link goes';
    warn('a11y-missing-alt', `${what} (or an aria-label)`, tag);
  }
}

function checkContent({ el, attrs, tag, warn }: Check): void {
  const heading = HEADINGS.has(el.name);
  if (!heading && el.name !== 'a' && el.name !== 'button') return;
  if (attrs.spread || hasContent(el) || attrs.value('aria-hidden') === 'true') return;
  const labels = heading ? ['aria-label', 'aria-labelledby'] : ['aria-label', 'aria-labelledby', 'title'];
  if (labels.some((name) => attrs.has(name)) || CONTENT_PROPERTIES.some((name) => attrs.has(name) || attrs.bound(name)) || attrs.has('contenteditable')) return;
  const message = heading
    ? `<${el.name}> is empty: add text so screen readers can announce the heading`
    : `<${el.name}> has no content, so screen readers cannot announce it: add text, or an aria-label (or title) if it only shows an icon`;
  warn('a11y-missing-content', message, tag);
}

function checkHref({ el, attrs, tag, warn }: Check): void {
  if (el.name !== 'a') return;
  const action = attrs.listener('click') !== undefined;
  if (missingHref(attrs)) {
    const message = action
      ? '<a> without an href cannot be reached with the keyboard: use a <button> for actions'
      : '<a> without an href is not a link: add an href (or an id / name if it is a scroll target)';
    warn('a11y-invalid-href', message, tag);
    return;
  }
  const attr = attrs.get('href') ?? attrs.get('xlink:href');
  const value = attr === undefined ? null : staticValue(attr);
  if (attr === undefined || value === null) return;
  const href = value.trim();
  if (href !== '' && href !== '#' && !href.toLowerCase().startsWith('javascript:')) return;
  const what = href === '' ? 'An empty href' : href === '#' ? 'href="#"' : 'A javascript: href';
  const fix = action ? 'use a <button> for actions' : 'link to a real URL, or to the id of an element (href="#section")';
  warn('a11y-invalid-href', `${what} does not lead anywhere: ${fix}`, attr);
}

function checkClick(check: Check): void {
  const { el, attrs, tag, warn } = check;
  const click = attrs.listener('click');
  if (click === undefined || attrs.spread || isInteractive(check) || attrs.hiddenOrPresentational()) return;
  // reported by a11y-invalid-href, which already suggests a <button>
  if (el.name === 'a' && missingHref(attrs)) return;
  if (!KEY_EVENTS.some((type) => attrs.listener(type) !== undefined)) {
    warn('a11y-click-without-key', `<${el.name}> has a click handler but no keyboard handler: add onKeyDown (e.g. onKeyDown|enter={...}) so keyboard users can use it too, or use a <button>`, click.nameSpan);
  }
  if (!attrs.has('role') && !attrs.has('tabindex')) {
    warn('a11y-interactive-without-role', `<${el.name}> with a click handler is neither focusable nor announced as a control: use a <button>, or add role="button" and tabindex="0"`, tag);
  }
}

function checkTabindex({ attrs, warn }: Check): void {
  const attr = attrs.get('tabindex');
  const value = attr === undefined ? null : staticValue(attr);
  if (attr === undefined || value === null || !(Number(value) > 0)) return;
  warn('a11y-positive-tabindex', `tabindex="${value.trim()}" breaks the natural tab order: use tabindex="0" to make the element focusable in document order, or move it in the markup`, attr);
}

function checkAriaAttributes({ el, warn }: Check): void {
  for (const attr of el.attributes) {
    if (attr.type !== 'Attribute' || attr.directive !== null) continue;
    const name = attr.name.toLowerCase();
    if (!name.startsWith('aria-') || ARIA_ATTRIBUTES.has(name)) continue;
    const suggestion = closest(name, ARIA_ATTRIBUTES);
    warn('a11y-unknown-aria', `${attr.name} is not a WAI-ARIA attribute${suggestion === null ? '' : `. Did you mean ${suggestion}?`}`, attr.nameSpan);
  }
}

function checkRole({ attrs, warn }: Check): void {
  const attr = attrs.get('role');
  const value = attr === undefined ? null : staticValue(attr);
  if (attr === undefined || value === null) return;
  const at = attr.value.type === 'Boolean' ? attr.nameSpan : attr.value.span;
  for (const role of splitTokens(value)) {
    const name = role.toLowerCase();
    if (ROLES.has(name)) continue;
    if (ABSTRACT_ROLES.has(name)) {
      warn('a11y-unknown-role', `"${role}" is an abstract ARIA role, which elements cannot use: pick a concrete role`, at);
      continue;
    }
    const suggestion = closest(name, ROLES);
    warn('a11y-unknown-role', `Unknown ARIA role "${role}"${suggestion === null ? ': see the WAI-ARIA 1.2 role list' : `. Did you mean "${suggestion}"?`}`, at);
  }
}

function checkLabel({ el, attrs, tag, warn }: Check): void {
  if (el.name !== 'label' || attrs.spread || attrs.has('for')) return;
  // a component or a slot may render the control
  const control = (child: Element) => child.kind === 'component' || child.kind === 'slot' || (child.kind === 'element' && (LABELABLE.has(child.name) || child.name.includes('-')));
  if (contains(el.children, control)) return;
  warn('a11y-label-without-control', '<label> is not associated with a form control: add for="<input id>", or put the <input>, <select> or <textarea> inside the label', tag);
}

function checkCaptions({ el, attrs, tag, warn }: Check): void {
  if (el.name !== 'video' || attrs.spread || attrs.has('muted') || attrs.bound('muted')) return;
  const captions = (child: Element) => {
    if (child.name !== 'track') return false;
    const kind = new Attributes(child).value('kind');
    return kind === null || kind?.toLowerCase() === 'captions';
  };
  if (contains(el.children, captions)) return;
  warn('a11y-media-captions', '<video> has no captions: add <track kind="captions" src="..."> (or the muted attribute if it has no sound)', tag);
}

function checkDistracting({ el, tag, warn }: Check): void {
  if (el.name !== 'marquee' && el.name !== 'blink') return;
  warn('a11y-distracting', `<${el.name}> is distracting and hard to read: remove it, or use a CSS animation that respects prefers-reduced-motion`, tag);
}

const RULES: ((check: Check) => void)[] = [checkAlt, checkContent, checkHref, checkClick, checkTabindex, checkAriaAttributes, checkRole, checkLabel, checkCaptions, checkDistracting];

/** Accessibility checks for the HTML elements of one component. */
export class A11yChecker {
  /** `<dialog>` elements seen so far: autofocus is expected inside them */
  private readonly dialogs: Span[] = [];

  constructor(private readonly reporter: A11yReporter) {}

  /** Check one HTML element (not a component or a special element), after its ancestors. */
  check(el: Element): void {
    const warn: Warn = (code, message, at) => this.reporter.warn(code, message, at.start, at.end);
    const check: Check = { el, attrs: new Attributes(el), tag: { start: el.start, end: el.nameSpan.end }, warn };
    for (const rule of RULES) rule(check);
    if (el.name === 'dialog') this.dialogs.push(el);
    this.checkAutofocus(check);
  }

  private checkAutofocus({ el, attrs, warn }: Check): void {
    const attr = attrs.get('autofocus');
    if (attr === undefined || this.dialogs.some((d) => el.start >= d.start && el.start < d.end)) return;
    warn('a11y-autofocus', 'Avoid autofocus: moving focus on page load can disorient screen reader and keyboard users (it is fine inside a <dialog>)', attr);
  }
}

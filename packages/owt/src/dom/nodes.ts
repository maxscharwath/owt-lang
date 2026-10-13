/** Low-level DOM helpers shared by the runtime. */

export const TEMPLATE_FRAGMENT = 1;
export const TEMPLATE_SVG = 2;
export const TEMPLATE_MATHML = 4;

export type NodeRange = { first: Node; last: Node };

/**
 * Compile-time templates: the HTML is parsed once (lazily) and every instance
 * is a deep clone. `flags` tells whether the template has several roots and
 * whether it must be parsed in the SVG / MathML namespace.
 */
export function template(html: string, flags = 0): () => Node {
  let node: Node | undefined;
  return () => {
    if (node === undefined) node = parseTemplate(html, flags);
    return node.cloneNode(true);
  };
}

function parseTemplate(html: string, flags: number): Node {
  const t = document.createElement('template');
  const ns = flags & TEMPLATE_SVG ? 'svg' : flags & TEMPLATE_MATHML ? 'math' : '';
  t.innerHTML = ns ? `<${ns}>${html}</${ns}>` : html;
  // Import once into the main document so clones never need adoption.
  let content: Node = document.importNode(t.content, true);
  if (ns) {
    const wrapper = content.firstChild!;
    const frag = document.createDocumentFragment();
    while (wrapper.firstChild !== null) frag.appendChild(wrapper.firstChild);
    content = frag;
  }
  if (flags & TEMPLATE_FRAGMENT) return content;
  return content.firstChild ?? document.createComment('');
}

/** Insert `content` (node or fragment) before `anchor` and return the inserted range. */
export function insertContent(anchor: Node, content: Node): NodeRange {
  const parent = anchor.parentNode!;
  if (content.nodeType === 11) {
    let first = content.firstChild;
    let last = content.lastChild;
    if (first === null || last === null) {
      first = last = document.createTextNode('');
      parent.insertBefore(first, anchor);
      return { first, last };
    }
    parent.insertBefore(content, anchor);
    return { first, last };
  }
  parent.insertBefore(content, anchor);
  return { first: content, last: content };
}

/** Replace a template placeholder with real content. */
export function replace(placeholder: Node, content: Node): void {
  const parent = placeholder.parentNode!;
  if (content.nodeType === 11 && content.firstChild === null) {
    parent.replaceChild(document.createTextNode(''), placeholder);
  } else {
    parent.replaceChild(content, placeholder);
  }
}

export function removeRange(first: Node, last: Node): void {
  const parent = first.parentNode;
  if (parent === null) return;
  let node: Node | null = first;
  while (node !== null) {
    const next: Node | null = node.nextSibling;
    parent.removeChild(node);
    if (node === last) break;
    node = next;
  }
}

export function moveRange(first: Node, last: Node, before: Node): void {
  const parent = before.parentNode!;
  if (first === last) {
    parent.insertBefore(first, before);
    return;
  }
  let node: Node | null = first;
  while (node !== null) {
    const next: Node | null = node.nextSibling;
    parent.insertBefore(node, before);
    if (node === last) break;
    node = next;
  }
}

/** Collect a range into a fragment (used when content has to leave the document temporarily). */
export function rangeToFragment(first: Node, last: Node): DocumentFragment {
  const frag = document.createDocumentFragment();
  let node: Node | null = first;
  while (node !== null) {
    const next: Node | null = node.nextSibling;
    frag.appendChild(node);
    if (node === last) break;
    node = next;
  }
  return frag;
}

/** Text value used for `{expr}` interpolations: nullish and booleans render nothing. */
export function str(value: unknown): string {
  return value == null || typeof value === 'boolean' ? '' : typeof value === 'string' ? value : String(value);
}

export function comment(): Comment {
  return document.createComment('');
}

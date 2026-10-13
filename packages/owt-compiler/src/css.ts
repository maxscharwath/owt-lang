/**
 * Scoped CSS: every compound selector of a component's `<style>` gets the
 * component's scope class (first occurrence `.owt-x`, later ones
 * `:where(.owt-x)` so specificity grows by one class only).
 * `:global(...)` / `:global ...` opt out; nested rules (`&`) and at-rules are
 * handled; keyframes are left untouched.
 */

const PASSTHROUGH_AT_RULES = new Set([
  'font-face',
  'page',
  'property',
  'counter-style',
  'font-feature-values',
  'font-palette-values',
  'view-transition',
  'position-try',
]);
const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes']);
const LEGACY_PSEUDO_ELEMENTS = [':before', ':after', ':first-line', ':first-letter'];
const UNSCOPED_COMPOUNDS = new Set([':root', 'html', 'body', ':host']);

function isNameChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95;
}

class CssScoper {
  private pos = 0;
  private out = '';

  constructor(
    private readonly css: string,
    private readonly scope: string,
  ) {}

  run(): string {
    this.block(false);
    // unmatched '}' at top level: copy the rest
    if (this.pos < this.css.length) this.out += this.css.slice(this.pos);
    return this.out;
  }

  private skipString(i: number): number {
    const quote = this.css[i];
    i++;
    while (i < this.css.length) {
      const c = this.css[i];
      if (c === '\\') i += 2;
      else if (c === quote) return i + 1;
      else i++;
    }
    return i;
  }

  private skipComment(i: number): number {
    const end = this.css.indexOf('*/', i + 2);
    return end < 0 ? this.css.length : end + 2;
  }

  /** Index of the first top-level occurrence of one of `stops`. */
  private scanUntil(from: number, stops: string): number {
    let depth = 0;
    let i = from;
    const css = this.css;
    while (i < css.length) {
      const c = css[i]!;
      if (c === '"' || c === "'") {
        i = this.skipString(i);
        continue;
      }
      if (c === '/' && css[i + 1] === '*') {
        i = this.skipComment(i);
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth <= 0 && stops.includes(c)) return i;
      i++;
    }
    return css.length;
  }

  private copyTrivia(): void {
    const css = this.css;
    for (;;) {
      const c = css[this.pos];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f') {
        this.out += c;
        this.pos++;
      } else if (c === '/' && css[this.pos + 1] === '*') {
        const end = this.skipComment(this.pos);
        this.out += css.slice(this.pos, end);
        this.pos = end;
      } else {
        return;
      }
    }
  }

  /** Copy a balanced `{ ... }` block verbatim (starting at `{`). */
  private copyBlock(): void {
    let depth = 0;
    const start = this.pos;
    let i = this.pos;
    while (i < this.css.length) {
      const c = this.css[i]!;
      if (c === '"' || c === "'") {
        i = this.skipString(i);
        continue;
      }
      if (c === '/' && this.css[i + 1] === '*') {
        i = this.skipComment(i);
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }
    this.out += this.css.slice(start, i);
    this.pos = i;
  }

  private block(inRule: boolean): void {
    const css = this.css;
    for (;;) {
      this.copyTrivia();
      if (this.pos >= css.length) return;
      const c = css[this.pos];
      if (c === '}') return;
      if (c === '@') {
        this.atRule(inRule);
        continue;
      }
      const stop = this.scanUntil(this.pos, ';{}');
      const segment = css.slice(this.pos, stop);
      if (css[stop] === '{') {
        this.out += `${this.selectorList(segment, inRule)}{`;
        this.pos = stop + 1;
        this.block(true);
        if (css[this.pos] === '}') {
          this.out += '}';
          this.pos++;
        }
      } else {
        // declaration (or stray text)
        const end = css[stop] === ';' ? stop + 1 : stop;
        this.out += css.slice(this.pos, end);
        this.pos = end;
      }
    }
  }

  private atRule(inRule: boolean): void {
    const css = this.css;
    let i = this.pos + 1;
    while (i < css.length && isNameChar(css.charCodeAt(i))) i++;
    const name = css.slice(this.pos + 1, i).toLowerCase();
    const stop = this.scanUntil(i, ';{}');
    if (css[stop] !== '{') {
      const end = css[stop] === ';' ? stop + 1 : stop;
      this.out += css.slice(this.pos, end);
      this.pos = end;
      return;
    }
    if (KEYFRAMES.has(name) || PASSTHROUGH_AT_RULES.has(name)) {
      this.out += css.slice(this.pos, stop);
      this.pos = stop;
      this.copyBlock();
      return;
    }
    // conditional / grouping rules: @media, @supports, @container, @layer, @scope, @starting-style...
    this.out += css.slice(this.pos, stop + 1);
    this.pos = stop + 1;
    this.block(inRule);
    if (css[this.pos] === '}') {
      this.out += '}';
      this.pos++;
    }
  }

  private splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (c === '"' || c === "'") {
        const close = text.indexOf(c, i + 1);
        i = close < 0 ? text.length : close;
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === separator && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  private selectorList(text: string, nested: boolean): string {
    return this.splitTopLevel(text, ',')
      .map((sel) => this.complexSelector(sel, nested))
      .join(',');
  }

  /** Split a complex selector into compounds and the combinators between them. */
  private compounds(sel: string): { parts: string[]; separators: string[] } {
    const parts: string[] = [];
    const separators: string[] = [];
    let depth = 0;
    let current = '';
    let i = 0;
    while (i < sel.length) {
      const c = sel[i]!;
      if (c === '"' || c === "'") {
        const close = sel.indexOf(c, i + 1);
        const end = close < 0 ? sel.length : close + 1;
        current += sel.slice(i, end);
        i = end;
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      if (depth === 0 && (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '>' || c === '+' || c === '~')) {
        let sep = '';
        while (i < sel.length && ' \n\t\r>+~'.includes(sel[i]!)) {
          sep += sel[i];
          i++;
        }
        parts.push(current);
        separators.push(sep);
        current = '';
        continue;
      }
      current += c;
      i++;
    }
    parts.push(current);
    return { parts, separators };
  }

  private complexSelector(sel: string, nested: boolean): string {
    const { parts, separators } = this.compounds(sel);
    let out = '';
    let global = false;
    let scoped = 0;
    parts.forEach((part, index) => {
      let compound = part;
      if (compound === ':global') {
        global = true;
        compound = '';
      } else if (compound !== '') {
        const unwrapped = unwrapGlobal(compound);
        const isGlobal = global || unwrapped.whollyGlobal;
        compound = unwrapped.text;
        const relative = nested && compound.startsWith('&');
        if (!isGlobal && !relative && !UNSCOPED_COMPOUNDS.has(compound.toLowerCase())) {
          const cls = scoped === 0 ? `.${this.scope}` : `:where(.${this.scope})`;
          compound = insertScope(compound, cls);
          scoped++;
        }
      }
      out += compound;
      const sep = separators[index];
      if (sep !== undefined) out += compound === '' && sep.trim() === '' && part === ':global' ? '' : sep;
    });
    return out;
  }
}

/** `:global(x)` → x. */
function unwrapGlobal(compound: string): { text: string; whollyGlobal: boolean } {
  if (!compound.includes(':global(')) return { text: compound, whollyGlobal: false };
  let text = '';
  let i = 0;
  let onlyGlobal = true;
  while (i < compound.length) {
    if (compound.startsWith(':global(', i)) {
      let depth = 1;
      let j = i + 8;
      while (j < compound.length && depth > 0) {
        if (compound[j] === '(') depth++;
        else if (compound[j] === ')') depth--;
        j++;
      }
      text += compound.slice(i + 8, j - 1);
      i = j;
    } else {
      text += compound[i];
      onlyGlobal = false;
      i++;
    }
  }
  return { text, whollyGlobal: onlyGlobal };
}

/** Insert the scope class before pseudo-elements. */
function insertScope(compound: string, cls: string): string {
  let at = compound.length;
  let depth = 0;
  for (let i = 0; i < compound.length; i++) {
    const c = compound[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ':' && depth === 0) {
      if (compound[i + 1] === ':') {
        at = i;
        break;
      }
      const rest = compound.slice(i).toLowerCase();
      if (LEGACY_PSEUDO_ELEMENTS.some((p) => rest === p || rest.startsWith(`${p}:`))) {
        at = i;
        break;
      }
    }
  }
  if (compound.slice(0, at) === '*') return cls + compound.slice(at);
  return compound.slice(0, at) + cls + compound.slice(at);
}

export function scopeCss(css: string, scope: string): string {
  return new CssScoper(css, scope).run();
}

/** Short, stable hash (FNV-1a, base36). */
export function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

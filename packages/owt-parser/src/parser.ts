import type {
  Attribute,
  Component,
  Element,
  Expr,
  ForBlock,
  IfBlock,
  IfBranch,
  ElseBranch,
  Program,
  ShorthandAttribute,
  SlotContent,
  SlotPlaceholder,
  SpreadAttribute,
  StyleBlock,
  Text,
  ValDecl,
  VarDecl,
  Node,
  Location,
} from '@owt/ast';
import { Tokenizer, type Token } from './tokenizer';

export type ParseOptions = {
  debug?: boolean;
  logger?: (msg: string) => void;
};

class ParseError extends Error {
  constructor(message: string, public loc?: Location) {
    super(message);
  }
}

export function parse(source: string, opts: ParseOptions = {}): Program {
  const debug = !!opts.debug;
  const log = opts.logger ?? ((msg: string) => console.log(`[owt:parser] ${msg}`));
  if (debug) log(`parse start (len=${source.length})`);
  const t = new Tokenizer(source);
  const tokens: Token[] = [];
  // simple token buffer to enable 1-token lookahead when needed
  function peek(): Token {
    if (tokens.length === 0) tokens.push(t.next());
    return tokens[0]!;
  }
  function next(): Token {
    if (tokens.length > 0) return tokens.shift()!;
    return t.next();
  }
  function expect(type: Token['type'], value?: string): Token {
    const tok = next();
    const tokVal = (tok as any).value as string | undefined;
    if (tok.type !== type || (value !== undefined && tokVal !== value)) {
      throw new ParseError(`Expected ${type}${value ? ' ' + value : ''} but got ${tok.type} ${tokVal ?? ''}`);
    }
    return tok;
  }

  function expectName(): Token & { type: 'name'; value: string } {
    const tok = expect('name') as any;
    if (!('value' in tok)) throw new ParseError('Expected identifier with value');
    return tok;
  }

  function expectKeyword(kw: string): Token & { type: 'keyword'; value: string } {
    const tok = expect('keyword', kw) as any;
    if (!('value' in tok)) throw new ParseError(`Expected keyword ${kw}`);
    return tok;
  }

  function expectString(): Token & { type: 'string'; value: string } {
    const tok = expect('string') as any;
    if (!('value' in tok)) throw new ParseError('Expected string literal');
    return tok;
  }

  function valueOf(tok: Token): string {
    return (tok as any).value ?? '';
  }

  function locFrom(startTok: Token, endTok: Token): Location {
    return { start: startTok.start, end: endTok.end };
  }

  function makeText(value: string, start: Token, end: Token): Text {
    return { type: 'Text', value, loc: locFrom(start, end) };
  }

  function readTSBlockWithinBraces(): Expr {
    // Assumes the last token read was an lbrace
    // Collect raw code until matching rbrace, accounting for nested braces/strings.
    let depth = 1;
    let code = '';
    const start = tokens.length ? tokens[0] : { start: peek().start, end: peek().end } as any;
    let lastTok = start as Token;
    let inString: '"' | "'" | '`' | null = null;
    let escape = false;
    // For simplicity, we directly read from the source string starting at current tokenizer position
    // but we don't have direct access to tokenizer cursor. Instead, we reconstruct by consuming tokens as text tokens.
    // Approach: consume character by character from tokenizer until depth returns to 0.
    // Simplify: use a miniature char reader from the tokenizer's input is not available.
    // So fallback: accumulate raw characters via token stream — since tokenizer does not split TS expr into tokens,
    // we rely on text tokens for anything that isn't a brace. This works because tokenizer only singles out braces and angle/quotes.
    for (;;) {
      const tok = next();
      lastTok = tok;
      if (tok.type === 'eof') throw new ParseError('Unterminated expression', locFrom(start as any, tok));
      if (tok.type === 'lbrace' && !inString) { depth++; code += '{'; continue; }
      if (tok.type === 'rbrace' && !inString) { depth--; if (depth === 0) break; code += '}'; continue; }
      // reconstruct value
      if (tok.type === 'string') {
        // reconstruct quoted string; safest to quote again
        code += JSON.stringify(valueOf(tok));
      } else if (tok.type === 'name' || tok.type === 'keyword' || tok.type === 'text') {
        code += valueOf(tok);
      } else if (tok.type === 'lt') code += '<';
      else if (tok.type === 'gt') code += '>';
      else if (tok.type === 'slash') code += '/';
      else if (tok.type === 'equals') code += '=';
      else if (tok.type === 'lparen') code += '(';
      else if (tok.type === 'rparen') code += ')';
      else if (tok.type === 'lbracket') code += '[';
      else if (tok.type === 'rbracket') code += ']';
      else if (tok.type === 'comma') code += ',';
      else if (tok.type === 'dot') code += '.';
    }
    const end = lastTok;
    return { type: 'Expr', code: code.trim(), loc: locFrom(start as any, end) };
  }

  function parseAttribute(): Attribute | ShorthandAttribute | SpreadAttribute {
    const start = peek();
    if (peek().type === 'lbrace') {
      next(); // consume '{'
      // could be spread or shorthand
      if (peek().type === 'dot') {
        // Unexpected, dot cannot open; ensure it's actually '...'
        // But tokenizer yields single 'dot', not ellipsis. Fall back to simple parse: require name or rbrace.
      }
      if (peek().type === 'name' && valueOf(peek()) === '...') {
        // not reachable with current tokenizer
      }
      // Simulate spread detection: we expect either '...' or an identifier followed by '}' for shorthand
      // For now: detect '...' by seeing three consecutive dots tokens
      let isSpread = false;
      let dotCount = 0;
      while (peek().type === 'dot') { next(); dotCount++; }
      if (dotCount === 3) isSpread = true;
      if (isSpread) {
        const expr = readTSBlockWithinBraces();
        return { type: 'SpreadAttribute', argument: expr, loc: expr.loc };
      }
      // shorthand: {name}
      const nameTok = expectName();
      const r = expect('rbrace');
      return {
        type: 'ShorthandAttribute',
        name: nameTok.value!,
        loc: locFrom(start, r),
      };
    }

    const nameTok = expectName();
    let value: Attribute['value'] = null;
    if (peek().type === 'equals') {
      next();
      const vtok = peek();
      if (vtok.type === 'string') {
        const s = next();
        value = { type: 'Text', value: valueOf(s), loc: locFrom(s, s) };
      } else if (vtok.type === 'lbrace') {
        next();
        const expr = readTSBlockWithinBraces();
        value = expr;
      } else {
        throw new ParseError('Expected attribute value', locFrom(nameTok, vtok));
      }
    }
    const end = value ? value.loc : locFrom(nameTok, nameTok);
    return { type: 'Attribute', name: nameTok.value!, value: value as any, loc: end };
  }

  function parseElement(): Element | SlotPlaceholder {
    const lt = expect('lt');
    let closing = false;
    if (peek().type === 'slash') { closing = true; next(); }
    const nameTok = expectName();

    if (closing) {
      // standalone closing tag — should be handled by caller
      throw new ParseError(`Unexpected closing tag </${nameTok.value}>`, locFrom(lt, nameTok));
    }

    const name = nameTok.value!;
    const attributes: (Attribute | ShorthandAttribute | SpreadAttribute)[] = [];
    let selfClosing = false;

    while (peek().type !== 'gt' && !(peek().type === 'slash')) {
      // attributes and/or whitespace
      const tok = peek();
      if (tok.type === 'name' || tok.type === 'lbrace') {
        attributes.push(parseAttribute());
      } else if (tok.type === 'text') {
        next(); // skip whitespace text between attrs
      } else {
        break;
      }
    }
    if (peek().type === 'slash') {
      next();
      selfClosing = true;
    }
    const gt = expect('gt');

    // style special-case: capture raw content until </style>
    if (name === 'style') {
      // collect everything until we see </style>
      let content = '';
      let endTok: Token = gt;
      while (!(peek().type === 'lt' && (() => { const s = peek(); return false; })())) {
        const tok = next();
        endTok = tok;
        if (tok.type === 'eof') throw new ParseError('Unterminated <style> block', locFrom(gt, tok));
        // reconstruct content
        if (tok.type === 'text' || tok.type === 'name' || tok.type === 'keyword' || tok.type === 'string') content += valueOf(tok);
        else if (tok.type === 'lbrace') content += '{';
        else if (tok.type === 'rbrace') content += '}';
        else if (tok.type === 'gt') content += '>';
        else if (tok.type === 'lt') {
          // potential close tag
          // consume '/' and name 'style' and '>'
          if (peek().type === 'slash') {
            next();
            const nm = expectName();
            if ((nm.value ?? '').toLowerCase() !== 'style') {
              throw new ParseError('Mismatched closing tag inside <style>', locFrom(lt, nm));
            }
            const endgt = expect('gt');
            endTok = endgt;
            break;
          } else {
            content += '<';
          }
        } else if (tok.type === 'slash') content += '/';
        else if (tok.type === 'equals') content += '=';
      }
      const style: StyleBlock = { type: 'StyleBlock', content, loc: locFrom(lt, endTok) };
      // Represent as a SlotPlaceholder-like node with name 'style' to let caller attach to component
      return {
        type: 'SlotPlaceholder',
        name: '__style__',
        loc: locFrom(lt, endTok),
      } as SlotPlaceholder & any;
    }

    // slot placeholder
    if (name === 'slot') {
      let slotName: string | null = null;
      for (const a of attributes) {
        if (a.type === 'Attribute' && a.name === 'name' && a.value && a.value.type === 'Text') {
          slotName = a.value.value;
        }
      }
      return { type: 'SlotPlaceholder', name: slotName, loc: locFrom(lt, gt) };
    }

    const element: Element = {
      type: 'Element',
      name,
      attributes,
      children: [],
      selfClosing,
      loc: locFrom(lt, gt),
    };
    if (selfClosing) return element;

    // children until closing tag
    function consumeTextRun(): Text | null {
      let acc = '';
      let started = false;
      for (;;) {
        const t = peek();
        if (t.type === 'lt' || t.type === 'lbrace' || t.type === 'eof') {
          // ensure a space before structural break if we already emitted a word
          if (started && acc.length && acc[acc.length-1] !== ' ') acc += ' ';
          break;
        }
        if (t.type === 'keyword' && (valueOf(t) === 'if' || valueOf(t) === 'for')) break;
        next();
        const v = valueOf(t) ?? '';
        if (t.type === 'name' || t.type === 'keyword' || t.type === 'string') {
          if (started && acc.length && acc[acc.length-1] !== ' ') acc += ' ';
          acc += v;
          started = true;
        } else {
          acc += v;
          started = true;
        }
      }
      if (acc.trim() === '') return null;
      const fake = peek();
      return makeText(acc, fake, fake);
    }

    for (;;) {
      const tok = peek();
      if (tok.type === 'lt') {
        // closing tag?
        const save = tok;
        next();
        if (peek().type === 'slash') {
          next();
          const closeName = expectName();
          if ((closeName.value ?? '').toLowerCase() !== name.toLowerCase()) {
            throw new ParseError(`Mismatched closing tag: expected </${name}> but got </${closeName.value}>`, locFrom(save, closeName));
          }
          const endgt = expect('gt');
          element.loc = locFrom(lt, endgt);
          break;
        } else {
          // nested element start
          // Put back: we consumed '<', reconstruct by creating a pseudo-token to allow parseElement to re-read it
          tokens.unshift(save);
          element.children.push(parseElement());
        }
      } else if (tok.type === 'lbrace') {
        next();
        const expr = readTSBlockWithinBraces();
        element.children.push(expr);
      } else if (tok.type === 'keyword') {
        const kw = valueOf(tok);
        if (kw === 'if' || kw === 'for') {
          const n = parseStatementOrNode();
          if (n) element.children.push(n);
        } else {
          const tnode = consumeTextRun();
          if (tnode) element.children.push(tnode);
        }
      } else if (tok.type === 'text' || tok.type === 'name' || tok.type === 'string') {
        const tnode = consumeTextRun();
        if (tnode) element.children.push(tnode);
      } else if (tok.type === 'eof') {
        throw new ParseError(`Unclosed tag <${name}>`, element.loc);
      } else {
        // ignore incidental tokens
        next();
      }
    }
    return element;
  }

  // var/val declarations will be added in a follow-up iteration.

  function parseStatementOrNode(): Node | null {
    const tok = peek();
    // var / val declarations
    if (tok.type === 'keyword' && (valueOf(tok) === 'var' || valueOf(tok) === 'val')) {
      const isVar = valueOf(tok) === 'var';
      next(); // consume var/val
      const nameTok = expectName();
      // skip optional type annotation tokens until '=' or ';' or line end-ish
      while (peek().type !== 'equals' && peek().type !== 'eof') {
        const t = peek();
        // crude end of statement detection if we see a text token with ';'
        if (t.type === 'text' && (valueOf(t) ?? '').includes(';')) {
          next(); // consume and finish without initializer
          const decl = isVar
            ? ({ type: 'VarDecl', name: nameTok.value!, init: null, loc: locFrom(tok, t) } as VarDecl)
            : ({ type: 'ValDecl', name: nameTok.value!, init: { type: 'Expr', code: 'undefined', loc: locFrom(tok, t) } as any, loc: locFrom(tok, t) } as ValDecl);
          return decl;
        }
        // if this looks like a colon type or identifier, skip
        if (t.type === 'equals' || t.type === 'lt' || t.type === 'lbrace' || t.type === 'gt') break;
        next();
      }
      let initExpr: Expr | null = null;
      if (peek().type === 'equals') {
        next();
        // read initializer until semicolon or end of block; reuse lightweight serializer
        let code = '';
        for (;;) {
          const t = next();
          if (t.type === 'eof') break;
          if (t.type === 'text') {
            const v = valueOf(t) ?? '';
            const semi = v.indexOf(';');
            if (semi >= 0) {
              code += v.slice(0, semi);
              break;
            }
            code += v;
          } else if (t.type === 'string') code += JSON.stringify(valueOf(t));
          else if (t.type === 'name' || t.type === 'keyword') code += valueOf(t);
          else if (t.type === 'lparen') code += '(';
          else if (t.type === 'rparen') code += ')';
          else if (t.type === 'lbrace') code += '{';
          else if (t.type === 'rbrace') { code += '}'; break; }
          else if (t.type === 'lbracket') code += '[';
          else if (t.type === 'rbracket') code += ']';
          else if (t.type === 'lt') code += '<';
          else if (t.type === 'gt') code += '>';
          else if (t.type === 'equals') code += '=';
          else if (t.type === 'comma') code += ',';
          else if (t.type === 'dot') code += '.';
          else if (t.type === 'slash') code += '/';
        }
        initExpr = { type: 'Expr', code: code.trim(), loc: locFrom(nameTok, nameTok) } as any;
      }
      if (isVar) {
        const decl: VarDecl = { type: 'VarDecl', name: nameTok.value!, tsType: undefined, init: (initExpr as any) ?? null, loc: locFrom(tok, nameTok) } as any;
        return decl;
      } else {
        if (!initExpr) throw new ParseError('val requires initializer', locFrom(tok, nameTok));
        const decl: ValDecl = { type: 'ValDecl', name: nameTok.value!, tsType: undefined, init: initExpr!, loc: locFrom(tok, nameTok) } as any;
        return decl;
      }
    }
    if (tok.type === 'text') {
      next();
      const v = valueOf(tok);
      if ((v ?? '').trim() === '') return null;
      return makeText(v ?? '', tok, tok);
    }
    if (tok.type === 'lbrace') {
      next();
      return readTSBlockWithinBraces();
    }
    if (tok.type === 'lt') {
      return parseElement();
    }
    if (tok.type === 'keyword' && valueOf(tok) === 'if') {
      // if (...) { ... } [else if (...) { ... }]* [else { ... }]
      const ifStart = next();
      expect('lparen');
      const testStart = { ...(peek() as any) };
      // read expr inside parens
      let depth = 1;
      let code = '';
      while (depth > 0) {
        const tk = next();
        if (tk.type === 'lparen') depth++;
        else if (tk.type === 'rparen') { depth--; if (depth === 0) break; }
        else if (tk.type === 'string') code += JSON.stringify(valueOf(tk));
        else code += valueOf(tk) || (tk.type === 'comma' ? ',' : tk.type === 'dot' ? '.' : tk.type === 'lt' ? '<' : tk.type === 'gt' ? '>' : tk.type === 'lbrace' ? '{' : tk.type === 'rbrace' ? '}' : '');
      }
      const test: Expr = { type: 'Expr', code: code.trim(), loc: { start: testStart.start, end: peek().end } } as any;
      // parse block { ... }
      const lbrace = expect('lbrace');
      const consequent: Node[] = [];
      while (peek().type !== 'rbrace' && peek().type !== 'eof') {
        const n = parseStatementOrNode();
        if (n) consequent.push(n);
      }
      const rbrace = expect('rbrace');
      const branches: IfBranch[] = [
        { type: 'IfBranch', test, consequent, loc: { start: ifStart.start, end: rbrace.end } },
      ];
      let alternate: ElseBranch | null = null;
      while (peek().type === 'keyword' && valueOf(peek()) === 'else') {
        const elseTok = next();
        if (peek().type === 'keyword' && valueOf(peek()) === 'if') {
          next();
          expect('lparen');
          let code = '';
          let depth = 1;
          const testStart2 = { ...(peek() as any) };
          while (depth > 0) {
            const tk = next();
            if (tk.type === 'lparen') depth++;
            else if (tk.type === 'rparen') { depth--; if (depth === 0) break; }
            else if (tk.type === 'string') code += JSON.stringify(valueOf(tk));
            else code += valueOf(tk);
          }
          const test2: Expr = { type: 'Expr', code: code.trim(), loc: { start: testStart2.start, end: peek().end } } as any;
          const lb = expect('lbrace');
          const cons: Node[] = [];
          while (peek().type !== 'rbrace' && peek().type !== 'eof') {
            const n = parseStatementOrNode();
            if (n) cons.push(n);
          }
          const rb = expect('rbrace');
          branches.push({ type: 'IfBranch', test: test2, consequent: cons, loc: { start: elseTok.start, end: rb.end } });
        } else {
          const lb = expect('lbrace');
          const cons: Node[] = [];
          while (peek().type !== 'rbrace' && peek().type !== 'eof') {
            const n = parseStatementOrNode();
            if (n) cons.push(n);
          }
          const rb = expect('rbrace');
          alternate = { type: 'ElseBranch', consequent: cons, loc: { start: elseTok.start, end: rb.end } };
          break;
        }
      }
      const lastEnd = branches[branches.length-1]!.loc.end;
      const block: IfBlock = { type: 'IfBlock', branches, alternate, loc: { start: ifStart.start, end: (alternate ? alternate.loc.end : lastEnd) } };
      return block;
    }
    if (tok.type === 'keyword' && valueOf(tok) === 'for') {
      // for (item of iterable, meta) { ... } empty { ... }
      const forTok = next();
      expect('lparen');
      const itemTok = expectName();
      const ofTok = expectName();
      if (ofTok.value !== 'of') throw new ParseError("Expected 'of' in for(...)", locFrom(ofTok, ofTok));
      // iterable expr until top-level ',' or ')'
      let code = '';
      let depth = 0;
      while (true) {
        const pk = peek();
        if (pk.type === 'rparen' && depth === 0) break;
        if (pk.type === 'comma' && depth === 0) break;
        const tk = next();
        if (tk.type === 'lparen') { depth++; code += '('; continue; }
        if (tk.type === 'rparen') { depth = Math.max(0, depth - 1); code += ')'; continue; }
        if (tk.type === 'string') code += JSON.stringify(valueOf(tk));
        else if (tk.type === 'keyword' || (tk.type === 'name' && valueOf(tk) === 'rev')) code += valueOf(tk) + ' ';
        else if (tk.type === 'lt') code += '<';
        else if (tk.type === 'gt') code += '>';
        else if (tk.type === 'lbrace') code += '{';
        else if (tk.type === 'rbrace') code += '}';
        else if (tk.type === 'lbracket') code += '[';
        else if (tk.type === 'rbracket') code += ']';
        else if (tk.type === 'dot') code += '.';
        else if (tk.type === 'comma') code += ',';
        else if (tk.type === 'equals') code += '=';
        else if (tk.type === 'slash') code += '/';
        else code += valueOf(tk);
      }
      let metaIdent: string | null = null;
      if (peek().type === 'comma') {
        next();
        const metaTok = expectName();
        metaIdent = metaTok.value ?? null;
      }
      expect('rparen');
      const lb = expect('lbrace');
      const body: Node[] = [];
      while (peek().type !== 'rbrace' && peek().type !== 'eof') {
        const n = parseStatementOrNode();
        if (n) body.push(n);
      }
      const rb = expect('rbrace');
      let empty: Node[] | null = null;
      if (peek().type === 'keyword' && valueOf(peek()) === 'empty') {
        next();
        const lb2 = expect('lbrace');
        empty = [];
        while (peek().type !== 'rbrace' && peek().type !== 'eof') {
          const n = parseStatementOrNode();
          if (n) empty.push(n);
        }
        expect('rbrace');
      }
      const iterable: Expr = { type: 'Expr', code: code.trim(), loc: { start: forTok.start, end: rb.end } } as any;
      const block: ForBlock = {
        type: 'ForBlock',
        item: itemTok.value!,
        iterable,
        metaIdent,
        body,
        empty,
        loc: { start: forTok.start, end: rb.end },
      };
      return block;
    }
    return null;
  }

  function parseComponent(): Component {
    const exportTok = peek().type === 'keyword' && valueOf(peek()) === 'export' ? next() : null;
    const compTok = expectKeyword('component');
    const nameTok = expectName();
    let propsType: string | undefined;
    if (peek().type === 'lparen') {
      // parse until ')'
      next();
      let code = '';
      let depth = 1;
      while (depth > 0) {
        const tk = next();
        if (tk.type === 'lparen') depth++;
        else if (tk.type === 'rparen') { depth--; if (depth === 0) break; }
        else if (tk.type === 'string') code += JSON.stringify(valueOf(tk));
        else code += valueOf(tk) || (tk.type === 'comma' ? ',' : tk.type === 'dot' ? '.' : tk.type === 'lt' ? '<' : tk.type === 'gt' ? '>' : '');
      }
      propsType = code.trim();
    }
    const lb = expect('lbrace');
    const body: Node[] = [];
    let style: StyleBlock | null = null;
    while (peek().type !== 'rbrace' && peek().type !== 'eof') {
      const tok = peek();
      if (tok.type === 'lt') {
        const el = parseElement();
        // sniff style placeholder
        if ((el as any).name === '__style__') {
          // record style later; we didn't capture content here for simplicity
          style = { type: 'StyleBlock', content: '', loc: el.loc };
        } else {
          body.push(el as Element);
        }
      } else {
        const n = parseStatementOrNode();
        if (n) body.push(n);
      }
    }
    const rb = expect('rbrace');
    const baseComp: any = {
      type: 'Component',
      name: nameTok.value!,
      export: !!exportTok,
      body,
      style,
      loc: { start: (exportTok ?? compTok).start, end: rb.end },
    };
    if (propsType && propsType.length) baseComp.propsType = propsType;
    const comp: Component = baseComp;
    return comp;
  }

  // Program
  const components: (Component | StyleBlock)[] = [];
  while (peek().type !== 'eof') {
    const tok = peek();
    if (tok.type === 'keyword' && (valueOf(tok) === 'export' || valueOf(tok) === 'component')) {
      components.push(parseComponent());
    } else if (tok.type === 'text') {
      next(); // skip whitespace/comments for now
    } else {
      // Unknown top-level token: skip
      next();
    }
  }
  const program = { type: 'Program', body: components, loc: { start: { offset: 0, line: 1, column: 1 }, end: (peek() as any).end } } as Program;
  if (debug) log(`parse done (components=${components.length})`);
  return program;
}

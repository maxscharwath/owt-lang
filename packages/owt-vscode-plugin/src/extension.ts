import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

let __ts: any;
function getTS(): any {
  if (__ts) return __ts;
  try {
    // Prefer workspace-provided dependency
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    __ts = require('typescript');
    return __ts;
  } catch {}
  // Fallback to vendored copy packaged with the extension
  const vendored = path.join(__dirname, '..', 'vendor', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(vendored)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    __ts = require(vendored);
    return __ts;
  }
  throw new Error('TypeScript module not found');
}

const KEYWORDS = [
  'export',
  'component',
  'var',
  'val',
  'if',
  'else',
  'for',
  'empty',
  'switch',
  'case',
  'default',
  'slot',
  'rev',
  'await',
  'of',
];

const DOCS: Record<string, string> = {
  export: 'Marks the component as exported.',
  component: 'Declare a component: component Name(props: Type) { ... }',
  var: 'Reactive, writable signal that persists across renders.',
  val: 'Read-only binding; static or reactive derived from vars.',
  if: 'Conditional block: if (cond) { ... } else { ... }',
  else: 'Optional branch following an if or else if.',
  for: 'Loop: for (x of iterable, meta) { ... } empty { ... }',
  empty: 'Optional fallback block for empty iterables in for.',
  switch: 'Switch with pattern matching and guards.',
  case: 'Case inside switch; supports literal/guard patterns.',
  default: 'Default case inside switch.',
  slot: 'Declare a slot placeholder (<slot name="header" />) or use slot(name) {...}.',
  rev: 'Reverse order modifier in for: for (x of rev 1..10)',
  await: 'Await expression support in vals and expressions.',
  of: 'Used in for (item of iterable) syntax.'
};

function toVsRange(loc: { start: { line: number; column: number }; end: { line: number; column: number } }): vscode.Range {
  const start = new vscode.Position(Math.max(0, loc.start.line - 1), Math.max(0, loc.start.column - 1));
  const end = new vscode.Position(Math.max(0, loc.end.line - 1), Math.max(0, loc.end.column - 1));
  return new vscode.Range(start, end);
}

function provideKeywordCompletions(): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  for (const kw of KEYWORDS) {
    const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
    item.insertText = kw;
    item.detail = `OWT keyword`;
    item.documentation = DOCS[kw] || 'OWT keyword';
    items.push(item);
  }
  // Useful snippets
  const comp = new vscode.CompletionItem('component snippet', vscode.CompletionItemKind.Snippet);
  comp.insertText = new vscode.SnippetString('export component ${1:App}(${2:props}: ${3:{}}) {\n  ${0}\n}');
  comp.detail = 'OWT: component skeleton';
  items.push(comp);

  const ifelse = new vscode.CompletionItem('if/else', vscode.CompletionItemKind.Snippet);
  ifelse.insertText = new vscode.SnippetString('if (${1:cond}) {\n  ${2}\n} else {\n  ${0}\n}');
  ifelse.detail = 'OWT: if/else block';
  items.push(ifelse);

  const forEmpty = new vscode.CompletionItem('for ... empty', vscode.CompletionItemKind.Snippet);
  forEmpty.insertText = new vscode.SnippetString('for (${1:item} of ${2:iterable}${3:, meta}) {\n  ${4}\n} empty {\n  ${0}\n}');
  forEmpty.detail = 'OWT: for loop with empty';
  items.push(forEmpty);

  return items;
}

export function activate(context: vscode.ExtensionContext) {
  const diag = vscode.languages.createDiagnosticCollection('owt');
  context.subscriptions.push(diag);

  function maskStringsAndCommentsAndBraces(input: string): string {
    const s = input;
    const out: string[] = s.split("");
    let i = 0;
    const n = s.length;
    function maskRange(a: number, b: number) {
      for (let k = a; k < b; k++) out[k] = " ";
    }
    while (i < n) {
      const ch = s[i];
      const next = i + 1 < n ? s[i + 1] : '';
      // Block comment /* ... */
      if (ch === '/' && next === '*') {
        const start = i;
        i += 2;
        while (i < n && !(s[i] === '*' && i + 1 < n && s[i + 1] === '/')) i++;
        i = Math.min(n, i + 2);
        maskRange(start, i);
        continue;
      }
      // Line comment // ... (not in spec, but safe to mask)
      if (ch === '/' && next === '/') {
        const start = i;
        i += 2;
        while (i < n && s[i] !== '\n') i++;
        maskRange(start, i);
        continue;
      }
      // Strings
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        const start = i;
        i++;
        let esc = false;
        while (i < n) {
          const c = s[i];
          if (esc) { esc = false; i++; continue; }
          if (c === '\\') { esc = true; i++; continue; }
          if (c === quote) { i++; break; }
          i++;
        }
        maskRange(start, i);
        continue;
      }
      // Balanced braces: mask contents including braces to avoid tag regex inside TS
      if (ch === '{') {
        const start = i;
        let depth = 1;
        i++;
        while (i < n && depth > 0) {
          const c = s[i];
          const c2 = i + 1 < n ? s[i + 1] : '';
          if (c === '"' || c === "'" || c === '`') {
            // skip string inside
            const q = c;
            i++;
            let esc = false;
            while (i < n) {
              const d = s[i];
              if (esc) { esc = false; i++; continue; }
              if (d === '\\') { esc = true; i++; continue; }
              if (d === q) { i++; break; }
              i++;
            }
            continue;
          }
          if (c === '/' && c2 === '*') {
            // skip block comment inside
            i += 2;
            while (i < n && !(s[i] === '*' && i + 1 < n && s[i + 1] === '/')) i++;
            i = Math.min(n, i + 2);
            continue;
          }
          if (c === '{') { depth++; i++; continue; }
          if (c === '}') { depth--; i++; continue; }
          i++;
        }
        maskRange(start, i);
        continue;
      }
      i++;
    }
    return out.join("");
  }

  function simpleTagDiagnostics(doc: vscode.TextDocument, text: string): vscode.Diagnostic[] {
    const masked = maskStringsAndCommentsAndBraces(text);
    const diagnostics: vscode.Diagnostic[] = [];
    const tagRe = /<\/?([A-Za-z][\w-]*)\b[^>]*?>/g;
    type OpenTag = { name: string; start: number; end: number };
    const stack: OpenTag[] = [];
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(masked))) {
      const raw = m[0]!;
      const name = m[1]!;
      const isClose = raw.startsWith('</');
      const isSelf = /\/>\s*$/.test(raw);
      if (!isClose) {
        if (!isSelf) stack.push({ name, start: m.index!, end: m.index! + raw.length });
        continue;
      }
      // closing tag
      if (stack.length === 0) {
        const r = new vscode.Range(doc.positionAt(m.index!), doc.positionAt(m.index! + raw.length));
        diagnostics.push(new vscode.Diagnostic(r, `Unexpected closing tag </${name}>`, vscode.DiagnosticSeverity.Error));
        continue;
      }
      const top = stack[stack.length - 1]!;
      if (top.name.toLowerCase() !== name.toLowerCase()) {
        const r = new vscode.Range(doc.positionAt(m.index!), doc.positionAt(m.index! + raw.length));
        diagnostics.push(new vscode.Diagnostic(r, `Mismatched closing tag: expected </${top.name}> but got </${name}>`, vscode.DiagnosticSeverity.Error));
        // Attempt recovery: pop until match or empty
        let found = false;
        for (let i = stack.length - 2; i >= 0; i--) {
          if (stack[i]!.name.toLowerCase() === name.toLowerCase()) { stack.length = i; found = true; break; }
        }
        if (!found) { stack.length = 0; }
      } else {
        stack.pop();
      }
    }
    for (const unclosed of stack) {
      const r = new vscode.Range(doc.positionAt(unclosed.start), doc.positionAt(unclosed.end));
      diagnostics.push(new vscode.Diagnostic(r, `Unclosed tag <${unclosed.name}>`, vscode.DiagnosticSeverity.Error));
    }
    for (const d of diagnostics) (d as any).source = 'owt';
    return diagnostics;
  }

  function braceDiagnostics(doc: vscode.TextDocument, text: string): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const stack: number[] = [];
    const n = text.length;
    let i = 0;
    let quote: '"' | "'" | '`' | null = null;
    let esc = false;
    while (i < n) {
      const c = text[i];
      if (quote) {
        if (esc) { esc = false; i++; continue; }
        if (c === '\\') { esc = true; i++; continue; }
        if (c === quote) { quote = null; i++; continue; }
        i++; continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c as any; i++; continue; }
      if (c === '/' && i + 1 < n && text[i + 1] === '*') {
        i += 2; while (i < n && !(text[i] === '*' && i + 1 < n && text[i + 1] === '/')) i++; i = Math.min(n, i + 2); continue;
      }
      if (c === '{') { stack.push(i); i++; continue; }
      if (c === '}') {
        if (stack.length === 0) {
          const r = new vscode.Range(doc.positionAt(i), doc.positionAt(i + 1));
          diagnostics.push(new vscode.Diagnostic(r, "Unmatched '}'", vscode.DiagnosticSeverity.Error));
        } else {
          stack.pop();
        }
        i++; continue;
      }
      i++;
    }
    if (stack.length) {
      const off = stack[stack.length - 1]!;
      const r = new vscode.Range(doc.positionAt(off), doc.positionAt(off + 1));
      diagnostics.push(new vscode.Diagnostic(r, "Unclosed '{'", vscode.DiagnosticSeverity.Error));
    }
    for (const d of diagnostics) (d as any).source = 'owt';
    return diagnostics;
  }

  function buildVirtualTS(text: string) {
    // Try to extract component props type: component Name(props: Type)
    let propsDecl = 'declare const props: any;';
    const compSig = /(\n|^)\s*(?:export\s+)?component\s+[A-Za-z_][\w-]*\s*\(\s*([A-Za-z_][\w-]*)\s*:\s*([^)]*)\)/.exec(text);
    if (compSig) {
      const propName = compSig[2] || 'props';
      const propType = (compSig[3] || 'any').trim();
      propsDecl = `declare const ${propName}: ${propType};\n` + (propName !== 'props' ? `declare const props: ${propType};` : '');
    }
    const header = [
      '/* virtual TS extracted from .owt */',
      '// minimal built-ins to avoid noisy lib errors',
      'interface Array<T> { length: number; [n: number]: T }',
      'interface ReadonlyArray<T> { length: number; [n: number]: T }',
      'interface Promise<T> {}',
      'interface String { readonly length: number }',
      'interface Number {}',
      'interface Boolean {}',
      'type Event = any; type MouseEvent = any; type KeyboardEvent = any;',
      'declare const console: any;',
      'declare const Math: any;',
      propsDecl,
      'declare function range(a: any, b: any): any;',
      'declare function rev<T>(x: T): T;',
      'declare function toArray<T>(x: T): T;',
      ''
    ].join('\n');
    const parts: string[] = [header];
    type Chunk = { tsStart: number; tsEnd: number; docStart: number; docEnd: number };
    const chunks: Chunk[] = [];
    let pos = header.length + 1; // +1 for trailing newline join

    const addChunk = (code: string, docStart: number, docEnd: number) => {
      const tsStart = pos;
      parts.push(code);
      pos += code.length + 1; // assume newline after each part
      const tsEnd = pos;
      chunks.push({ tsStart, tsEnd, docStart, docEnd });
    };

    const reVal = /(\n|^)\s*val\s+([A-Za-z_][\w-]*)\s*(?::\s*([^=;\n]+))?\s*=\s*([^;\n]+);?/g;
    const reVar = /(\n|^)\s*var\s+([A-Za-z_][\w-]*)\s*(?::\s*([^=;\n]+))?(?:\s*=\s*([^;\n]+))?;?/g;
    const declared = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = reVar.exec(text))) {
      const name = (m[2] || '').trim();
      if (!name || declared.has(name)) continue;
      declared.add(name);
      const typeAnn = (m[3] || '').trim();
      const init = (m[4] || '').trim();
      const id = name.replace(/-/g, '_');
      const code = `let ${id}${typeAnn ? `: ${typeAnn}` : ''}${init ? ` = (${init})` : ''};`;
      addChunk(code, m.index, m.index + m[0].length);
    }
    while ((m = reVal.exec(text))) {
      const name = (m[2] || '').trim();
      if (!name || declared.has(name)) continue;
      declared.add(name);
      const typeAnn = (m[3] || '').trim();
      const init = (m[4] || '').trim();
      const id = name.replace(/-/g, '_');
      const code = `const ${id}${typeAnn ? `: ${typeAnn}` : ''} = (${init});`;
      addChunk(code, m.index, m.index + m[0].length);
    }

    // Predeclare loop item identifiers from for (...) blocks
    const reFor = /(\n|^)\s*for\s*\(\s*([A-Za-z_][\w-]*)\s+of[\s\S]*?\)/g;
    while ((m = reFor.exec(text))) {
      const item = (m[2] || '').trim();
      if (!item || declared.has(item)) continue;
      declared.add(item);
      const id = item.replace(/-/g, '_');
      const code = `let ${id}: any;`;
      addChunk(code, m.index, m.index + m[0].length);
    }

    // Inline expressions extraction: only inside tag text nodes and attribute expressions ={
    function collectExpressions(src: string): Array<{ start: number; end: number; expr: string }> {
      const out: Array<{ start: number; end: number; expr: string }> = [];
      const n = src.length;
      let i = 0;
      let inTag = false;
      let tagStack: string[] = [];
      const pushExpr = (startBrace: number) => {
        let j = startBrace + 1;
        let depth = 1;
        let q: '"' | "'" | '`' | null = null;
        let esc = false;
        while (j < n && depth > 0) {
          const ch = src[j];
          if (q) {
            if (esc) { esc = false; j++; continue; }
            if (ch === '\\') { esc = true; j++; continue; }
            if (ch === q) { q = null; j++; continue; }
            j++; continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') { q = ch as any; j++; continue; }
          if (ch === '{') { depth++; j++; continue; }
          if (ch === '}') { depth--; j++; continue; }
          j++;
        }
        const end = Math.min(n, j);
        const expr = src.slice(startBrace + 1, end - 1).trim();
        if (expr) out.push({ start: startBrace, end, expr });
        return end;
      };
      function prevNonWs(pos: number): string | null {
        let k = pos;
        while (k >= 0) {
          const c = src[k];
          if (c && !/\s/.test(c)) return c;
          k--;
        }
        return null;
      }

      while (i < n) {
        const ch = src[i];
        // Enter/exit tags
        if (ch === '<') {
          // Closing tag
          if (i + 1 < n && src[i + 1] === '/') {
            inTag = true;
            // consume until '>'
            i += 2;
            while (i < n && src[i] !== '>') i++;
            if (i < n && src[i] === '>') { inTag = false; if (tagStack.length) tagStack.pop(); i++; continue; }
          } else {
            // opening/selfclosing tag
            inTag = true;
            // read tag name
            let j = i + 1;
            while (j < n && src[j] && /[A-Za-z0-9_-]/.test(src[j]!)) j++;
            const name = src.slice(i + 1, j);
            let selfClose = false;
            // scan attrs until '>'
            for (; j < n; j++) {
              const c = src[j];
              if (c === '"' || c === '\'') {
                const q = c; j++;
                for (; j < n; j++) { const d = src[j]; if (d === '\\') { j++; continue; } if (d === q) { break; } }
              } else if (c === '{' && j > i) {
                // attribute expression ={
                if (j - 1 >= 0 && src[j - 1] === '=') {
                  j = pushExpr(j) - 1; // -1 because for-loop will ++
                }
              } else if (c === '>' ) {
                selfClose = j - 1 >= 0 && src[j - 1] === '/';
                j++;
                break;
              }
            }
            inTag = false;
            if (!selfClose && name) tagStack.push(name);
            i = j;
            continue;
          }
        }
        // Text content between tags: allow {expr} (but not control blocks like 'if (...) {')
        if (!inTag && tagStack.length > 0 && ch === '{') {
          const prev = prevNonWs(i - 1);
          // Disallow after identifier or ')' ']' '}' to avoid control blocks
          if (prev && (/[_A-Za-z0-9)]|\]|\}/.test(prev))) {
            // skip: likely a control block or object literal in code region
            i++;
            continue;
          }
          i = pushExpr(i);
          continue;
        }
        i++;
      }
      return out;
    }

    for (const e of collectExpressions(text)) {
      const code = `void (${e.expr});`;
      addChunk(code, e.start, e.end);
    }

    const full = parts.join('\n');
    return { code: full, chunks };
  }

  function mapTsRangeToDoc(chunks: { tsStart: number; tsEnd: number; docStart: number; docEnd: number }[], start: number, length: number, doc: vscode.TextDocument): vscode.Range {
    const pos = start;
    for (const c of chunks) {
      if (pos >= c.tsStart && pos < c.tsEnd) {
        // Coarse mapping: highlight the originating OWT slice for this TS chunk
        return new vscode.Range(doc.positionAt(c.docStart), doc.positionAt(c.docEnd));
      }
    }
    return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));
  }

  function tsDiagnostics(doc: vscode.TextDocument, text: string): vscode.Diagnostic[] {
    const ts = getTS();
    const diagnostics: vscode.Diagnostic[] = [];
    const { code, chunks } = buildVirtualTS(text);
    const fileName = 'file.owt.ts';
    const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      strict: true,
      noEmit: true,
      noLib: true,
      skipLibCheck: true
    };
    const host: ts.CompilerHost = {
      fileExists: (f: string) => f === fileName,
      directoryExists: () => true,
      getDirectories: () => [],
      getCanonicalFileName: (f: string) => f,
      getCurrentDirectory: () => '/',
      getNewLine: () => '\n',
      getDefaultLibFileName: () => 'lib.d.ts',
      readFile: (f: string) => (f === fileName ? code : undefined),
      useCaseSensitiveFileNames: () => true,
      writeFile: () => {},
      getSourceFile: (f: string, languageVersion: ts.ScriptTarget) => (f === fileName ? sourceFile : undefined)
    };
    const program = ts.createProgram([fileName], options, host);
    const sf = program.getSourceFile(fileName)!;
    const all = [
      ...program.getSyntacticDiagnostics(sf),
      ...program.getSemanticDiagnostics(sf)
    ];
    for (const d of all) {
      const start = d.start ?? 0;
      const length = d.length ?? 1;
      const range = mapTsRangeToDoc(chunks, start, length, doc);
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      const sev = d.category === ts.DiagnosticCategory.Error ? vscode.DiagnosticSeverity.Error : d.category === ts.DiagnosticCategory.Warning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
      const vd = new vscode.Diagnostic(range, msg, sev);
      vd.source = 'owt-ts';
      diagnostics.push(vd);
    }
    return diagnostics;
  }

  const doValidate = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'owt') return;
    const diagnostics: vscode.Diagnostic[] = [];
    const text = doc.getText();
    // Lightweight diagnostics
    diagnostics.push(...braceDiagnostics(doc, text));
    diagnostics.push(...simpleTagDiagnostics(doc, text));
    // TypeScript-based checks for var/val and inline expressions
    diagnostics.push(...tsDiagnostics(doc, text));
    // Strip simple block comments to reduce false positives
    const noComments = text.replace(/\/\*[\s\S]*?\*\//g, ' ');

    // Collect all 'val' declarations: val name[: type]? = expr;
    const valDeclRe = /\bval\s+([A-Za-z_][\w-]*)\b/g;
    const valNames = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = valDeclRe.exec(noComments))) {
      valNames.add(m[1]!);
    }

    // For each val, find illegal writes: name =, name +=, ++name, name++
    for (const name of valNames) {
      // 1) plain/compound assignment
      const assignRe = new RegExp(
        `(?<!\\bval\\s)\\b${name}\\b\\s*([+\\-*/%&|^]|<<|>>>|>>)?=`,
        'g'
      );
      // 2) pre/post inc/dec
      const postIncDecRe = new RegExp(`\\b${name}\\b\\s*(?:\\+\\+|--)`, 'g');
      const preIncDecRe = new RegExp(`(?:\\+\\+|--)\\s*\\b${name}\\b`, 'g');

      const checkMatches = (re: RegExp) => {
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(noComments))) {
          const idx = mm.index;
          const start = doc.positionAt(idx);
          const end = doc.positionAt(idx + (mm[0]?.length ?? name.length));
          const range = new vscode.Range(start, end);
          const d = new vscode.Diagnostic(
            range,
            `Cannot assign to 'val' '${name}'. 'val' is read-only.`,
            vscode.DiagnosticSeverity.Error
          );
          d.source = 'owt';
          diagnostics.push(d);
        }
      };

      checkMatches(assignRe);
      checkMatches(postIncDecRe);
      checkMatches(preIncDecRe);
    }

    diag.set(doc.uri, diagnostics);
  };

  // Debounce validations
  const pending = new Map<string, NodeJS.Timeout>();
  function scheduleValidate(doc: vscode.TextDocument) {
    if (doc.languageId !== 'owt') return;
    const key = doc.uri.toString();
    const t = pending.get(key);
    if (t) clearTimeout(t);
    const h = setTimeout(() => doValidate(doc), 150);
    pending.set(key, h);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleValidate),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleValidate(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => diag.delete(doc.uri))
  );

  // Validate already-open OWT docs on activation
  vscode.workspace.textDocuments.filter((d) => d.languageId === 'owt').forEach(doValidate);

  // Completions
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'owt' },
    {
      provideCompletionItems() {
        return provideKeywordCompletions();
      }
    },
    '.', '{', '<', '>'
  );
  context.subscriptions.push(completionProvider);

  // Hovers
  const hoverProvider = vscode.languages.registerHoverProvider('owt', {
    provideHover(doc, pos) {
      const range = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_-]*/);
      if (!range) return;
      const word = doc.getText(range);
      const info = DOCS[word];
      if (!info) return;
      return new vscode.Hover({ language: 'markdown', value: `**${word}** — ${info}` });
    }
  });
  context.subscriptions.push(hoverProvider);

  // Document symbols (components, vars, vals)
  const symbolProvider = vscode.languages.registerDocumentSymbolProvider('owt', {
    provideDocumentSymbols(doc: vscode.TextDocument): vscode.DocumentSymbol[] {
      const text = doc.getText();
      const symbols: vscode.DocumentSymbol[] = [];
      // Find components: (export )?component Name( ... ) { ... }
      const compRe = /(export\s+)?component\s+([A-Za-z_][\w-]*)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = compRe.exec(text))) {
        const name = m[2];
        // Find the opening brace after this match
        const openParenIdx = text.indexOf('(', m.index);
        if (openParenIdx < 0) continue;
        // find matching ')' then '{'
        let depth = 0, i = openParenIdx;
        for (; i < text.length; i++) {
          const ch = text[i];
          if (ch === '(') depth++;
          else if (ch === ')') { depth--; if (depth === 0) { i++; break; } }
        }
        const lbraceIdx = text.indexOf('{', i);
        if (lbraceIdx < 0) continue;
        // match component body braces
        let bdepth = 0, j = lbraceIdx;
        for (; j < text.length; j++) {
          const ch = text[j];
          if (ch === '{') bdepth++;
          else if (ch === '}') { bdepth--; if (bdepth === 0) { j++; break; } }
        }
        const startPos = doc.positionAt(m.index);
        const endPos = doc.positionAt(j);
        const fullRange = new vscode.Range(startPos, endPos);
        const compSym = new vscode.DocumentSymbol(
          name!,
          m[1] ? 'export' : '',
          vscode.SymbolKind.Class,
          fullRange,
          new vscode.Range(doc.positionAt(lbraceIdx), doc.positionAt(lbraceIdx + 1))
        );
        // inner vars/vals
        const body = text.slice(lbraceIdx, j);
        const declRe = /\b(var|val)\s+([A-Za-z_][\w-]*)/g;
        let dm: RegExpExecArray | null;
        const children: vscode.DocumentSymbol[] = [];
        while ((dm = declRe.exec(body))) {
          const kind = dm[1] === 'var' ? vscode.SymbolKind.Variable : vscode.SymbolKind.Constant;
          const name2 = dm[2]!;
          const abs = lbraceIdx + dm.index!;
          const r = new vscode.Range(doc.positionAt(abs), doc.positionAt(abs + dm[0]!.length));
          children.push(new vscode.DocumentSymbol(name2, dm[1]!, kind, r, r));
        }
        compSym.children = children;
        symbols.push(compSym);
      }
      return symbols;
    }
  });
  context.subscriptions.push(symbolProvider);
}

export function deactivate() {}

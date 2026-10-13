/**
 * OWT-specific language features (everything TypeScript and CSS services
 * cannot know about): compiler diagnostics, document symbols, folding,
 * auto-closing tags, linked tag editing and keyword documentation.
 */
import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type * as vscode from '@volar/language-server';
import { parse } from '@owt/parser';
import { compile, CompileError } from '@owt/compiler';
import { walkTemplate, type ComponentDecl, type Element, type Program, type TemplateNode } from '@owt/ast';

const KEYWORDS: Record<string, string> = {
  component: 'Declares a component: `export component Name(props: Props) { ... }`. Parameters can be the whole `props` object, a destructuring pattern, or named props `(title: string, size = 16)`.',
  var: 'Reactive state. Assigning (`count = 1`, `count++`) or mutating (`todos.push(x)`) updates everything that reads it.',
  val: 'Derived value, recomputed lazily when the `var`s / props it reads change. Read-only.',
  if: 'Conditional markup: `if (cond) { ... } else if (other) { ... } else { ... }`. Must start a line.',
  for: 'List rendering: `for (item of items, { index, first, last }; track item.id) { ... } empty { ... }`. Supports ranges `1..10` and `rev`.',
  empty: 'Rendered when the `for` list is empty.',
  track: 'Key used to match list items between updates: `for (todo of todos; track todo.id)`.',
  rev: 'Iterate in reverse: `for (i of rev 1..10)`.',
  switch: 'Markup switch: `switch (value) { case "a", "b" { ... } case "c" if (cond) { ... } default { ... } }`.',
  case: 'A `switch` branch matching one or more values, with an optional `if (guard)`.',
  await: 'Async markup: `await (promise) { pending } then (value) { ... } catch (error) { ... }`.',
  then: 'Rendered with the resolved value of an `await` block.',
  catch: 'Rendered with the error of an `await` block, or as the fallback of a `try` error boundary: `catch (error, reset)`.',
  try: 'Error boundary: `try { <Risky/> } catch (error, reset) { ... }`.',
  key: 'Re-create the content when the key changes: `key (userId) { <Profile/> }`.',
  slot: 'In a component: `<slot name="x" arg={...}>fallback</slot>`. In a parent: `slot x({ arg }) { ... }` passes named content.',
};

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function components(program: Program): ComponentDecl[] {
  return program.body.filter((n): n is ComponentDecl => n.type === 'Component');
}

function templateNodes(c: ComponentDecl): TemplateNode[] {
  return c.body.filter((n): n is TemplateNode => n.type !== 'VarDecl' && n.type !== 'Statement' && n.type !== 'ValDecl');
}

function elementAt(program: Program, offset: number): Element | null {
  let found: Element | null = null;
  for (const c of components(program)) {
    walkTemplate(templateNodes(c), (node) => {
      if (node.type === 'Element' && node.start <= offset && offset <= node.end) found = node;
    });
  }
  return found;
}

function wordAt(text: string, offset: number): string {
  let start = offset;
  let end = offset;
  const isWord = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
  while (start > 0 && isWord(text[start - 1])) start--;
  while (end < text.length && isWord(text[end])) end++;
  return text.slice(start, end);
}

export function createOwtService(): LanguageServicePlugin {
  return {
    name: 'owt',
    capabilities: {
      diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
      documentSymbolProvider: true,
      foldingRangeProvider: true,
      linkedEditingRangeProvider: true,
      hoverProvider: true,
      autoInsertionProvider: { triggerCharacters: ['>'] },
    },
    create(): LanguageServicePluginInstance {
      const cache = new WeakMap<TextDocument, { version: number; program: Program }>();
      const programOf = (doc: TextDocument): Program | null => {
        if (doc.languageId !== 'owt') return null;
        const hit = cache.get(doc);
        if (hit !== undefined && hit.version === doc.version) return hit.program;
        const program = parse(doc.getText());
        cache.set(doc, { version: doc.version, program });
        return program;
      };
      const range = (doc: TextDocument, start: number, end: number): vscode.Range => ({ start: doc.positionAt(start), end: doc.positionAt(end) });

      return {
        provideDiagnostics(doc) {
          const program = programOf(doc);
          if (program === null) return null;
          const out: vscode.Diagnostic[] = [];
          for (const d of program.diagnostics) {
            // Babel syntax errors inside expressions are reported by TypeScript itself
            if (d.code.includes('-') || d.code === d.code.toLowerCase()) {
              out.push({ range: range(doc, d.start, d.end), message: d.message, severity: d.severity === 'error' ? 1 : 2, source: 'owt', code: d.code });
            }
          }
          if (out.length === 0) {
            try {
              const result = compile(doc.getText(), { filename: doc.uri, sourcemap: false });
              for (const w of result.warnings) out.push({ range: range(doc, w.start, w.end), message: w.message, severity: 2, source: 'owt', code: w.code });
            } catch (err) {
              if (err instanceof CompileError) {
                const message = err.message.slice(0, err.message.lastIndexOf(' ('));
                out.push({ range: range(doc, err.start, err.end), message, severity: 1, source: 'owt', code: err.code });
              }
            }
          }
          return out;
        },

        provideDocumentSymbols(doc) {
          const program = programOf(doc);
          if (program === null) return null;
          return components(program).map((c) => {
            const children: vscode.DocumentSymbol[] = [];
            for (const item of c.body) {
              if (item.type === 'VarDecl' || item.type === 'ValDecl') {
                for (const d of item.declarations) {
                  children.push({ name: d.name, detail: item.type === 'VarDecl' ? 'var' : 'val', kind: item.type === 'VarDecl' ? 13 : 14, range: range(doc, d.start, d.end), selectionRange: range(doc, d.id.start ?? d.start, d.id.end ?? d.end) });
                }
              } else if (item.type === 'Statement' && item.node !== null && item.node.type === 'FunctionDeclaration' && item.node.id != null) {
                children.push({ name: item.node.id.name, kind: 12, range: range(doc, item.start, item.end), selectionRange: range(doc, item.node.id.start ?? item.start, item.node.id.end ?? item.end) });
              }
            }
            return { name: c.name, detail: 'component', kind: 5, range: range(doc, c.start, c.end), selectionRange: range(doc, c.nameSpan.start, c.nameSpan.end), children };
          });
        },

        provideFoldingRanges(doc) {
          const program = programOf(doc);
          if (program === null) return null;
          const out: vscode.FoldingRange[] = [];
          const add = (start: number, end: number) => {
            const a = doc.positionAt(start).line;
            const b = doc.positionAt(end).line;
            if (b > a) out.push({ startLine: a, endLine: b - 1 });
          };
          for (const c of components(program)) {
            add(c.bodySpan.start, c.bodySpan.end);
            for (const s of c.styles) add(s.start, s.end);
            walkTemplate(templateNodes(c), (node) => {
              if (node.type === 'Element' && !node.selfClosing) add(node.start, node.end);
              else if (node.type !== 'Text' && node.type !== 'ExpressionTag' && node.type !== 'Element') add(node.start, node.end);
            });
          }
          return out;
        },

        provideLinkedEditingRanges(doc, position) {
          const program = programOf(doc);
          if (program === null) return null;
          const offset = doc.offsetAt(position);
          const el = elementAt(program, offset);
          if (el === null || el.closeNameSpan === null) return null;
          const inOpen = offset >= el.nameSpan.start && offset <= el.nameSpan.end;
          const inClose = offset >= el.closeNameSpan.start && offset <= el.closeNameSpan.end;
          if (!inOpen && !inClose) return null;
          return { ranges: [range(doc, el.nameSpan.start, el.nameSpan.end), range(doc, el.closeNameSpan.start, el.closeNameSpan.end)] };
        },

        provideHover(doc, position) {
          if (doc.languageId !== 'owt') return null;
          const word = wordAt(doc.getText(), doc.offsetAt(position));
          const docs = KEYWORDS[word];
          if (docs === undefined) return null;
          return { contents: { kind: 'markdown', value: `**${word}** (OWT)\n\n${docs}` } };
        },

        provideAutoInsertSnippet(doc, position, lastChange) {
          if (doc.languageId !== 'owt' || !lastChange.text.endsWith('>')) return null;
          const text = doc.getText();
          const offset = doc.offsetAt(position);
          if (text[offset - 2] === '/' || text[offset - 2] === '=') return null;
          const program = programOf(doc);
          if (program === null) return null;
          const el = elementAt(program, offset - 1);
          if (el === null || el.selfClosing || el.openEnd !== offset || el.closeNameSpan !== null) return null;
          if (el.kind === 'element' && VOID.has(el.name.toLowerCase())) return null;
          return `$0</${el.name}>`;
        },
      };
    },
  };
}

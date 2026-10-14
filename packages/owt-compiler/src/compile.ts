/** Compile an `.owt` file to a JavaScript module (+ CSS). */
import type * as t from '@babel/types';
import type { Diagnostic, Program } from '@owt/ast';
import { parse } from '@owt/parser';
import { CodeWriter, type Chunk, type SourceMap } from './chunks';
import { BindingScope } from './bindings';
import { compileComponent } from './component';
import { FileContext } from './context';
import { CompileError, Reporter } from './errors';
import { transformModule } from './js';
import { visitComponent } from './traverse';
import { Walker } from './walk';

export type CompileOptions = {
  /** file name used in errors, source maps and CSS scope hashes */
  filename?: string;
  /** development mode: extra checks, readable output */
  dev?: boolean;
  /** emit hot module replacement code (Vite) */
  hmr?: boolean;
  /** module the compiled code imports the runtime from */
  runtime?: string;
  /**
   * CSS delivery: `external` returns it in `result.css` (bundlers),
   * `injected` adds it to the document at runtime (no bundler needed).
   */
  css?: 'external' | 'injected';
  /** generate a source map (default true) */
  sourcemap?: boolean;
};

export type CompileResult = {
  js: { code: string; map: SourceMap | null };
  css: { code: string } | null;
  warnings: Diagnostic[];
  /** names of the components declared in the file */
  components: string[];
  ast: Program;
};

/** Every identifier name in the file (to generate collision-free names) and free reads (import elision). */
function analyzeNames(program: Program): { all: Set<string>; used: Set<string> } {
  const all = new Set<string>();
  const used = new Set<string>();
  const walker = (track: boolean) =>
    new Walker({
      read: (id) => {
        all.add(id.name);
        if (track) used.add(id.name);
      },
      write: (id) => {
        all.add(id.name);
        if (track) used.add(id.name);
      },
      declare: (id) => all.add(id.name),
    });
  for (const node of program.body) {
    if (node.type === 'Script') {
      for (const stmt of node.statements) {
        if (stmt.type === 'ImportDeclaration') {
          for (const s of stmt.specifiers) all.add(s.local.name);
          continue;
        }
        walker(true).statementsInScope([stmt]);
      }
    } else if (node.type === 'Component') {
      all.add(node.name);
      visitComponent(node, {
        node(n, kind) {
          const w = walker(true);
          if (kind === 'statement') w.statementsInScope([n as t.Statement]);
          else w.expression(n);
        },
        name(name) {
          all.add(name);
          used.add(name);
        },
      });
    }
  }
  return { all, used };
}

function unusedImports(program: Program, used: Set<string>): Set<string> {
  const unused = new Set<string>();
  for (const node of program.body) {
    if (node.type !== 'Script') continue;
    for (const stmt of node.statements) {
      if (stmt.type !== 'ImportDeclaration' || stmt.importKind === 'type') continue;
      for (const s of stmt.specifiers) if (!used.has(s.local.name)) unused.add(s.local.name);
    }
  }
  return unused;
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const filename = options.filename ?? 'Component.owt';
  const runtime = options.runtime ?? 'owt/internal';
  const ast = parse(source, { filename });
  const firstError = ast.diagnostics.find((d) => d.severity === 'error');
  if (firstError !== undefined) throw new CompileError(firstError, source, filename);

  const reporter = new Reporter(source, filename);
  const { all, used } = analyzeNames(ast);
  const rt = all.has('$') ? (all.has('$owt') ? '$owt$' : '$owt') : '$';
  const file = new FileContext(source, filename, reporter, rt, options.dev === true, all);
  const unused = unusedImports(ast, used);

  const body: Chunk[] = [];
  const css: string[] = [];
  const components: string[] = [];
  for (const node of ast.body) {
    if (node.type === 'Script') {
      body.push(
        transformModule(node.statements, node.start, node.end, {
          source,
          rt,
          props: '$$props',
          scope: new BindingScope(),
          reporter,
          name: (hint) => file.name(hint),
          unused,
          inComponent: false,
        }),
        '\n',
      );
    } else if (node.type === 'Component') {
      const compiled = compileComponent(node, file);
      components.push(compiled.name);
      body.push(compiled.code);
      if (compiled.css !== '') css.push(compiled.css);
    } else {
      css.push(node.content.trim());
    }
  }

  const writer = new CodeWriter(filename, source);
  writer.write(`import * as ${rt} from ${JSON.stringify(runtime)};\n`);
  for (const tmpl of file.templates) writer.write(tmpl);
  const cssCode = css.filter((c) => c !== '').join('\n\n');
  if (options.css === 'injected' && cssCode !== '') {
    writer.write(`${rt}.injectCss(${JSON.stringify(filename)}, ${JSON.stringify(cssCode)});\n`);
  }
  writer.write(body);
  if (file.delegated.size > 0) writer.write(`${rt}.delegate(${JSON.stringify([...file.delegated])});\n`);
  if (options.hmr === true && components.length > 0) {
    writer.write('if (import.meta.hot) {\n');
    writer.write(`  const $$hmr = (import.meta.hot.data.owt ??= {});\n`);
    for (const name of components) writer.write(`  ${name} = ${rt}.hmrAccept($$hmr, ${JSON.stringify(name)}, ${name});\n`);
    writer.write('  import.meta.hot.accept();\n}\n');
  }

  return {
    js: { code: writer.toString(), map: options.sourcemap === false ? null : writer.toMap() },
    css: options.css === 'injected' || cssCode === '' ? null : { code: cssCode },
    warnings: reporter.warnings,
    components,
    ast,
  };
}

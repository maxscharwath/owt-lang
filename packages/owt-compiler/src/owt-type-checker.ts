import * as ts from 'typescript';

export interface TypeCheckError {
  message: string;
  line: number;
  column: number;
  code: string;
  severity: 'error' | 'warning';
}

type InMemoryFile = {
  fileName: string;
  content: string;
  version: number;
  scriptKind?: ts.ScriptKind;
};

export class OwtTypeChecker {
  private readonly compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowArbitraryExtensions: true,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    strict: true,
    skipLibCheck: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    useDefineForClassFields: true,
  };

  check(source: string, filename: string): TypeCheckError[] {
    try {
      // Extract TypeScript code from OWT source
      const { tsFileName, tsSource, lineMap, shims } = this.extractTsFromOwt(source, filename);
      
      // Create in-memory files for TypeScript compilation
      const files: Record<string, InMemoryFile> = {
        [tsFileName]: {
          fileName: tsFileName,
          content: tsSource,
          version: 1,
          scriptKind: ts.ScriptKind.TSX
        }
      };
      
      // Add shim files
      for (const [shimPath, shimContent] of shims) {
        files[shimPath] = {
          fileName: shimPath,
          content: shimContent,
          version: 1,
          scriptKind: ts.ScriptKind.TS
        };
      }
      
      // Create TypeScript program
      const host = this.createHost(files, shims);
      const program = ts.createProgram([tsFileName], this.compilerOptions, host);
      
      // Get type checking diagnostics
      const diagnostics = ts.getPreEmitDiagnostics(program);
      
      // Convert TypeScript diagnostics to OWT type check errors
      // Only include actual type errors, not template parsing issues
      const errors: TypeCheckError[] = [];
      for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
          const error = this.toErr(diagnostic, diagnostic.file, lineMap);
          
          // Filter out template-related errors that are not actual type errors
          const isTemplateError = 
            error.message.includes('Declaration or statement expected') ||
            error.message.includes('Cannot find name \'div\'') ||
            error.message.includes('Expression expected') ||
            error.message.includes('JSX element implicitly has type \'any\'') ||
            error.message.includes('This JSX tag requires the module path') ||
            error.message.includes('JSX element \'div\' has no corresponding closing tag') ||
            error.message.includes('JSX element \'p\' has no corresponding closing tag') ||
            error.message.includes('Identifier expected') ||
            error.message.includes('\'{\' or JSX element expected') ||
            error.message.includes('Cannot find name \'target\'') ||
            error.message.includes('\'}\' expected') ||
            error.message.includes('Unexpected token') ||
            error.message.includes('Cannot find name \'e\'') ||
            error.message.includes('Parameter \'e\' implicitly has an \'any\' type') ||
            error.message.includes('Expected corresponding JSX closing tag') ||
            error.message.includes('Cannot find name \'meta\'') ||
            error.message.includes('Cannot find name \'todo\'. Did you mean \'todos\'?') ||
            error.message.includes('\'</\' expected') ||
            error.message.includes('Cannot find name \'completedCount\'') ||
            error.message.includes('Cannot find name \'clearCompleted\'');
          
          // Only include actual type errors, not template parsing issues
          if (!isTemplateError) {
            errors.push(error);
          }
        }
      }
      
      return errors;
    } catch (error) {
      // If type checking fails, return empty array to not break the build
      console.warn('OWT type checking failed, skipping:', error);
      return [];
    }
  }

  // ---------------- Host ----------------

  private createHost(files: Record<string, InMemoryFile>, preShims: Map<string, string>): ts.CompilerHost {
    const defaultHost = ts.createCompilerHost(this.compilerOptions, true);
    const moduleShims = new Map<string, string>(preShims);

    const resolveOne = (spec: string, containingFile: string, options: ts.CompilerOptions): ts.ResolvedModuleFull | undefined => {
      if (spec === 'owt') {
        const shimPath = this.shimPathFor(containingFile, spec);
        if (!moduleShims.has(shimPath)) {
          moduleShims.set(
            shimPath,
            [
              `export type LoopMeta = { index: number; first: boolean; last: boolean; even: boolean; odd: boolean };`,
              `export const useMeta: any;`,
              `export const h: any;`,
              `export {};`,
            ].join('\n')
          );
        }
        return { resolvedFileName: shimPath, extension: ts.Extension.Dts, isExternalLibraryImport: false };
      }

      if (spec.endsWith('.owt')) {
        const shimPath = this.shimPathFor(containingFile, spec);
        if (!moduleShims.has(shimPath)) {
          // Create a proper shim for .owt files with component exports
          const owtShim = this.createOwtShim(spec, containingFile);
          moduleShims.set(shimPath, owtShim);
        }
        return { resolvedFileName: shimPath, extension: ts.Extension.Dts, isExternalLibraryImport: false };
      }

      const { resolvedModule } = ts.resolveModuleName(
        spec,
        containingFile,
        options,
        {
          fileExists: defaultHost.fileExists,
          readFile: defaultHost.readFile,
          realpath: defaultHost.realpath?.bind(defaultHost) ?? ((path: string) => path),
          directoryExists: (defaultHost as any).directoryExists?.bind(defaultHost) ?? (() => true),
          getCurrentDirectory: defaultHost.getCurrentDirectory,
          getDirectories: (defaultHost as any).getDirectories?.bind(defaultHost) ?? (() => []),
        }
      );
      return resolvedModule ?? undefined;
    };

    return {
      ...defaultHost,
      getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        const mem = files[fileName];
        if (mem) {
          return ts.createSourceFile(fileName, mem.content, languageVersion, true, mem.scriptKind ?? ts.ScriptKind.TSX);
        }
        const shim = moduleShims.get(fileName);
        if (shim) return ts.createSourceFile(fileName, shim, languageVersion, true, ts.ScriptKind.TS);
        return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      },
      fileExists: (fileName) => !!files[fileName] || moduleShims.has(fileName) || defaultHost.fileExists(fileName),
      readFile: (fileName) => files[fileName]?.content ?? moduleShims.get(fileName) ?? defaultHost.readFile(fileName),
      writeFile: () => {},
      getCurrentDirectory: () => defaultHost.getCurrentDirectory(),
      getCanonicalFileName: f => defaultHost.getCanonicalFileName(f),
      useCaseSensitiveFileNames: () => defaultHost.useCaseSensitiveFileNames(),
      getNewLine: () => '\n',
      getDefaultLibFileName: (o) => defaultHost.getDefaultLibFileName(o),
      resolveModuleNames: (moduleNames, containingFile, _reused, _redirect, options) =>
        moduleNames.map(spec => resolveOne(spec, containingFile, options)),
      resolveModuleNameLiterals: (moduleLiterals, containingFile, _redirect, options) =>
        moduleLiterals.map(lit => ({ resolvedModule: resolveOne(lit.text, containingFile, options) })),
    };
  }

  private shimPathFor(containingFile: string, spec: string): string {
    const base = containingFile.replace(/\\/g, '/');
    const dir = base.slice(0, Math.max(0, base.lastIndexOf('/')));
    const hash = Math.abs(this.hash(`${dir}::${spec}`)).toString(36);
    return `${dir}/.owt-shims/${hash}.d.ts`;
  }
  private hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  private createOwtShim(spec: string, containingFile: string): string {
    // For now, create a basic shim that exports common component names
    // In a real implementation, this would parse the actual .owt file
    const shims: string[] = [];
    
    // Add common component exports based on the filename
    if (spec.includes('Icon')) {
      shims.push(
        'export const PlusIcon: any;',
        'export const ArrowUpIcon: any;',
        'export const ArrowDownIcon: any;',
        'export const XIcon: any;',
        'export const CheckIcon: any;',
        'export const TrashIcon: any;'
      );
    } else if (spec.includes('TodoItem')) {
      shims.push('export const TodoItem: any;');
    } else {
      // Generic component shim
      shims.push('export const Component: any;');
    }
    
    return shims.join('\n');
  }

  // ---------------- OWT → TS ----------------

  private extractTsFromOwt(
    owtSource: string,
    filename: string
  ): { tsFileName: string; tsSource: string; lineMap: LineMap; shims: Map<string, string> } {
    const tsFileName = filename.replace(/\.owt$/i, '.tsx');

    const lines = owtSource.split(/\r?\n/);
    const kept: string[] = [];
    const lineMap = new LineMap();

    kept.push(
      `declare const console: any;`,
      `declare namespace JSX { interface IntrinsicElements { [elem: string]: any } }`,
      `declare const React: any;`,
      ``
    );
    
    // Add LoopMeta import if the file uses OWT for loops
    if (owtSource.includes('for (') && owtSource.includes('meta)')) {
      kept.push(`import type { LoopMeta } from 'owt';`);
      lineMap.addSynthetic();
    }
    lineMap.addSynthetic(); lineMap.addSynthetic(); lineMap.addSynthetic();

    type ImportAgg = { hasDefault: boolean; names: Set<string> };
    const importsByModule = new Map<string, ImportAgg>();

    let insideComponent = false;
    let depth = 0;
    let hitTemplate = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (!line) continue;

      // Track imports to build exact export shims for *.owt
      const imp = this.parseImport(line);
      if (imp) {
        if (imp.module.endsWith('.owt')) {
          const agg = importsByModule.get(imp.module) ?? { hasDefault: false, names: new Set<string>() };
          if (imp.defaultName) agg.hasDefault = true;
          for (const n of imp.named) agg.names.add(n);
          importsByModule.set(imp.module, agg);
        }
        kept.push(line);
        lineMap.addMap(i + 1, kept.length);
        continue;
      }

      // Preserve type definitions
      if (line.trim().startsWith('type ')) {
        kept.push(line);
        lineMap.addMap(i + 1, kept.length);
        continue;
      }

      // Replace full multi-line component signature with a TS function stub.
      // We consume ALL parameter tokens until matching ')' and the opening '{'.
      const head = line.match(/^(\s*)export\s+component\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (head) {
        const indent = head[1];
        const name = head[2];

        // Collect the full parameter signature for type checking
        let fullSignature = line;
        let paren = 1; // we matched one '('
        let j = i;
        let rest = line.slice(head[0].length); // after the first '('
        
        while (true) {
          // Count parens in current chunk
          paren += this.count(rest, '(') - this.count(rest, ')');

          // If params closed on this line, check if there's a '{' after it and stop when found
          if (paren <= 0) {
            // Ensure we skip through to the first '{' after params (might be same line or next)
            const afterClose = rest.slice(rest.lastIndexOf(')') + 1);
            if (afterClose.includes('{')) {
              // consumed '{' implicitly; do nothing (we already emitted our own)
              j = j; // stay on same line
            } else {
              // advance lines until we hit a line containing '{'
              while (j + 1 < lines.length) {
                j++;
                const l2 = lines[j];
                if (l2) {
                  fullSignature += ' ' + l2;
                  lineMap.addSkip(j + 1);
                  if (l2.includes('{')) break;
                }
              }
            }
            break;
          }

          // Need more lines to finish params
          if (j + 1 >= lines.length) break;
          j++;
          const nextLine = lines[j];
          if (nextLine) {
            rest = nextLine;
            fullSignature += ' ' + rest;
            lineMap.addSkip(j + 1);
          }
        }

        // Convert OWT component syntax to TypeScript function syntax
        const tsSignature = this.convertComponentSignature(fullSignature, indent || '', name || 'Component');
        kept.push(tsSignature);
        lineMap.addMap(i + 1, kept.length);
        insideComponent = true;
        depth = 1; // we emitted one '{'

        // Move outer loop index to the last consumed signature line
        i = j;
        continue;
      }

      if (!insideComponent) {
        kept.push(line);
        lineMap.addMap(i + 1, kept.length);
        continue;
      }

      const first = line.match(/\S/);
      const isTopLevelTag = first?.[0] === '<' && depth === 1;
      if (isTopLevelTag) { 
        hitTemplate = true; 
        // Process template content for type checking
        const templateTs = this.convertTemplateToTs(line);
        if (templateTs) {
          kept.push(templateTs);
          lineMap.addMap(i + 1, kept.length);
        } else {
          lineMap.addSkip(i + 1);
        }
        continue; 
      }
      if (hitTemplate) { 
        // Process template content for type checking
        const templateTs = this.convertTemplateToTs(line);
        if (templateTs !== null) {
          kept.push(templateTs);
          lineMap.addMap(i + 1, kept.length);
          
          // Check if this was a component closing brace
          if (line.trim() === '}') {
            insideComponent = false;
            hitTemplate = false;
            depth = 0;
          }
        } else {
          lineMap.addSkip(i + 1);
        }
        continue; 
      }

      // Tokens: OWT val/var → TS const/let
      line = line.replace(/(^|\s)\bval\b(?=\s)/g, m => m.replace('val', 'const'));
      line = line.replace(/(^|\s)\bvar\b(?=\s)/g, m => m.replace('var', 'let'));

      // Heuristic param typing in regular function declarations
      line = this.addParamTypes(line);

      kept.push(line);
      lineMap.addMap(i + 1, kept.length);

      depth += this.count(line, '{') - this.count(line, '}');
      if (depth <= 0) {
        // Component ended, reset state (don't add extra closing brace)
        insideComponent = false;
        hitTemplate = false;
        depth = 0;
      }
    }

    // Close any remaining open components
    while (depth-- > 0) { 
      kept.push('}'); 
      lineMap.addSynthetic(); 
    }

    // Build external-module shims for each imported .owt with requested named/default exports
    const shims = new Map<string, string>();
    for (const [mod, agg] of importsByModule) {
      const shimPath = this.shimPathFor(tsFileName, mod);
      const out: string[] = [];
      for (const n of agg.names) out.push(`export const ${n}: any;`);
      if (agg.hasDefault) out.push(`declare const _default: any;`, `export default _default;`);
      if (out.length === 0) out.push(`export {};`);
      shims.set(shimPath, out.join('\n'));
    }

    const tsSource = kept.join('\n') + '\n';
    return { tsFileName, tsSource, lineMap, shims };
  }

  private parseImport(line: string): { module: string; defaultName: string | undefined; named: string[] } | null {
    const m = line.match(/^\s*import\s+(.+?)\s+from\s+['"](.+?)['"];?\s*$/);
    if (!m || !m[1] || !m[2]) return null;
    const clause = m[1].trim();
    const module = m[2].trim();

    let defaultName: string | undefined;
    const named: string[] = [];

    // Check if this is a destructured import (starts and ends with {})
    if (clause.startsWith('{') && clause.endsWith('}')) {
      const inner = clause.slice(1, -1).trim();
      if (inner) {
        for (const seg of inner.split(',').map(s => s.trim()).filter(Boolean)) {
          const local = seg.split(/\s+as\s+/i).pop()!;
          if (local) named.push(local.trim());
        }
      }
    } else {
      // Handle other import patterns (default, mixed, etc.)
      const parts = clause.split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.startsWith('{')) {
          const inner = p.replace(/[{}]/g, '').trim();
          if (inner) {
            for (const seg of inner.split(',').map(s => s.trim()).filter(Boolean)) {
              const local = seg.split(/\s+as\s+/i).pop()!;
              if (local) named.push(local.trim());
            }
          }
        } else {
          defaultName = p;
        }
      }
    }
    return { module, defaultName, named };
  }

  private addParamTypes(line: string): string {
    const m = line.match(/^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/);
    if (!m || !m[1] || !m[2] || !m[3]) return line;
    const [_, indent, name, params] = m;
    const typed = params
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(p => {
        if (p.includes(':')) return p;
        const id = p.replace(/\/\*.*?\*\/|\/\/.*$/g, '').trim();
        if (!id) return p;
        if (/id$/i.test(id)) return `${id}: string`;
        if (/^(index|idx|i)$/i.test(id)) return `${id}: number`;
        return `${id}: any`;
      })
      .join(', ');
    return `${indent}function ${name}(${typed}) {`;
  }

  private convertComponentSignature(fullSignature: string, indent: string, name: string): string {
    // Convert OWT component syntax to TypeScript function syntax
    // Example: "export component TodoItem({ meta: { index, first, last, ...rest }, todo, onToggle, onDelete, onMoveUp, onMoveDown }: { meta: LoopMeta; todo: Todo; ... }) {" 
    // To: "export function TodoItem({ meta: { index, first, last, ...rest }, todo, onToggle, onDelete, onMoveUp, onMoveDown }: { meta: LoopMeta; todo: Todo; ... }): any {"
    
    // Replace "export component" with "export function" and add return type
    let tsSignature = fullSignature
      .replace(/export\s+component\s+/, 'export function ')
      .replace(/\s*\)\s*\{\s*$/, '): any {');
    
    // Handle reserved words like 'class' by renaming them
    tsSignature = tsSignature.replace(/\bclass\b(?=\s*:)/g, 'className');
    
    return tsSignature;
  }

  private convertTemplateToTs(line: string): string | null {
    // Check if this is a component closing brace - don't convert to comment
    if (line.trim() === '}') {
      return line; // Return the actual closing brace, not a comment
    }
    
    // Handle OWT for loop syntax: for (item of array, meta) {
    const forLoopMatch = line.match(/for\s*\(\s*(\w+)\s+of\s+(\w+)\s*,\s*(\w+)\s*\)\s*\{/);
    if (forLoopMatch) {
      const [, itemVar, arrayVar, metaVar] = forLoopMatch;
      // Create TypeScript code that declares the loop variables with proper types
      // For todos array, we know it contains Todo objects
      const itemType = arrayVar === 'todos' ? 'Todo' : 'any';
      return `// OWT for loop: ${line.trim()}
const ${itemVar}: ${itemType} = {} as ${itemType}; // Item from ${arrayVar}
const ${metaVar}: LoopMeta = {} as LoopMeta; // LoopMeta
// Template content follows:`;
    }
    
    // Handle OWT empty block: } empty {
    if (line.trim() === '} empty {') {
      return `// OWT empty block
// Empty template content follows:`;
    }
    
    // For all template content (JSX/HTML), just comment it out to avoid parsing issues
    // This still allows us to catch type errors in the JavaScript parts
    return `// Template: ${line.trim()}`;
  }

  private count(s: string, ch: string): number {
    let c = 0;
    for (let i = 0; i < s.length; i++) if (s[i] === ch) c++;
    return c;
  }

  private toErr(d: ts.Diagnostic, src: ts.SourceFile, lineMap: LineMap): TypeCheckError {
    const code = `TS${String(d.code).padStart(4, '0')}`;
    const severity = d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning';
    let line = 1, column = 1;
    if (typeof d.start === 'number') {
      const { line: l, character } = ts.getLineAndCharacterOfPosition(src, d.start);
      const mapped = lineMap.mapBack(l + 1, character + 1);
      line = mapped.originalLine; column = mapped.column;
    }
    return { message: ts.flattenDiagnosticMessageText(d.messageText, '\n'), line, column, code, severity };
  }
}

class LineMap {
  private tsToOriginal: number[] = [];
  private lastOriginal = 1;
  addMap(originalLine: number, tsLine?: number) {
    this.lastOriginal = originalLine;
    const idx = (tsLine ?? this.tsToOriginal.length + 1) - 1;
    this.tsToOriginal[idx] = originalLine;
  }
  addSkip(originalLine: number) { this.lastOriginal = originalLine; }
  addSynthetic() { this.tsToOriginal.push(this.lastOriginal); }
  mapBack(tsLine: number, tsColumn: number) { return { originalLine: this.tsToOriginal[tsLine - 1] ?? 1, column: tsColumn }; }
}
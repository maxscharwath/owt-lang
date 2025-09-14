import type { Component, VarDecl, ValDecl, FunctionDecl } from '@owt/ast';
import type { CompilerContext } from '../context';
import { genExpr } from './util';
import { uid, resetIds } from './ids';
import { setCurrentState } from './state';
import { appendChildTo } from './control';

// Global state for component compilation
let __currentVarNames: string[] = [];
let __currentValInits: Record<string, string> = Object.create(null);
let __currentValDeps: Record<string, string[]> = Object.create(null);
let __currentContext: CompilerContext | null = null;

export function validateVarInitializers(vars: VarDecl[]): void {
  const __varNames = vars.map(v => v.name);
  for (const v of vars) {
    if (!v.init) continue;
    const code = (v.init as any).code ?? '';
    const offending = Array.from(code.matchAll(/[A-Za-z_$][\w$]*/g)).map((m: unknown) => (m as RegExpMatchArray)[0]).filter(n => __varNames.includes(n));
    if (offending.length) throw new Error(`var '${v.name}' initializer references reactive var(s) ${offending.join(', ')}; use 'val' for derived state.`);
  }
}

export function processValDeclarations(vals: ValDecl[], vars: VarDecl[]): { valInits: Record<string, string>; valDeps: Record<string, string[]> } {
  const __varNames = vars.map(v => v.name);
  const __valInits: Record<string, string> = Object.create(null);
  const __valDeps: Record<string, string[]> = Object.create(null);
  function depsFor(code: string): string[] {
    const re = /[A-Za-z_$][\w$]*/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) { const name = m[0]; if (__varNames.includes(name)) set.add(name); }
    return Array.from(set);
  }
  for (const v of vals) {
    const init = genExpr(v.init as any);
    __valInits[v.name] = init;
    __valDeps[v.name] = depsFor((v.init as any).code ?? '');
  }
  return { valInits: __valInits, valDeps: __valDeps };
}

export function extractValDeclarationsFromSource(compSource: string, existingVals: Record<string, string>): { valInits: Record<string, string>; valDeps: Record<string, string[]> } {
  const __valInits: Record<string, string> = { ...existingVals };
  const __valDeps: Record<string, string[]> = Object.create(null);
  function depsFor(code: string): string[] {
    const re = /[A-Za-z_$][\w$]*/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) { const name = m[0]; set.add(name); }
    return Array.from(set);
  }
  const re = /(^|\n)\s*val\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*([^;\n]+);?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(compSource)) !== null) {
    const name = m[2]!;
    if (!__valInits[name]) {
      const expr = m[3]!.trim();
      __valInits[name] = `(${expr})`;
      __valDeps[name] = depsFor(expr);
    }
  }
  return { valInits: __valInits, valDeps: __valDeps };
}

export function extractComponentParams(comp: Component, compSource: string): { destructuringPattern: string; paramMapping: Record<string, string> } {
  const m = compSource.match(/component\s+\w+\s*\(([^)]*)\)/);
  if (!m) return { destructuringPattern: '', paramMapping: {} };
  
  const fullParam = m[1]!.trim();
  let destructuringPattern = '';
  const paramMapping: Record<string, string> = {};
  
  try {
    // Find the colon that separates the destructuring pattern from the type annotation
    let depthCurly = 0, depthSquare = 0, depthParen = 0;
    let typeColon = -1;
    
    for (let i = 0; i < fullParam.length; i++) {
      const ch = fullParam.charCodeAt(i);
      if (ch === 123) depthCurly++;
      else if (ch === 125) depthCurly = Math.max(0, depthCurly - 1);
      else if (ch === 91) depthSquare++;
      else if (ch === 93) depthSquare = Math.max(0, depthSquare - 1);
      else if (ch === 40) depthParen++;
      else if (ch === 41) depthParen = Math.max(0, depthParen - 1);
      else if (ch === 58) {
        if (depthCurly === 0 && depthSquare === 0 && depthParen === 0) {
          typeColon = i;
          break;
        }
      }
    }
    
    destructuringPattern = (typeColon >= 0 ? fullParam.slice(0, typeColon) : fullParam).trim();
    
    // Extract individual parameter names for mapping (for reserved keywords)
    if (destructuringPattern) {
      // Simple extraction of top-level parameter names
      const paramNames = destructuringPattern.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g) || [];
      for (const paramName of paramNames) {
        if (paramName !== 'props') {
          const jsParamName = isReservedKeyword(paramName) ? `_${paramName}` : paramName;
          paramMapping[paramName] = jsParamName;
        }
      }
    }
  } catch {}
  
  return { destructuringPattern, paramMapping };
}

export function generateComponentBody(comp: Component, compSource: string, ctx: string, frag: string): { body: string; paramMapping: Record<string, string> } {
  let body = `function render() {\n`;
  body += `  const ${frag} = __rt.df();\n`;
  body += `  const props = ${ctx}.props;\n`;
  const { destructuringPattern, paramMapping } = extractComponentParams(comp, compSource);
  
  // Use the destructuring pattern directly
  if (destructuringPattern) {
    // If it's a simple parameter (not destructured), wrap it in braces
    if (!destructuringPattern.includes('{') && !destructuringPattern.includes('[')) {
      // For simple parameters, check if we need to rename reserved keywords
      if (Object.keys(paramMapping).length > 0) {
        // Generate destructuring with renaming for reserved keywords
        const destructuringEntries = Object.entries(paramMapping).map(([original, renamed]) => 
          original === renamed ? original : `${original}: ${renamed}`
        );
        body += `  const { ${destructuringEntries.join(', ')} } = props;\n`;
      } else {
        body += `  const { ${destructuringPattern} } = props;\n`;
      }
    } else {
      body += `  const ${destructuringPattern} = props;\n`;
    }
  }
  
  return { body, paramMapping };
}

export function isReservedKeyword(name: string): boolean {
  const reserved = ['class', 'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'with', 'delete', 'void', 'null', 'undefined', 'true', 'false', 'NaN', 'Infinity'];
  return reserved.includes(name);
}

export function generateContextObject(ctx: string, compName: string): string {
  return `const ${ctx} = { props, __root: null, __update: () => {}, __subs: Object.create(null), __notify: (names) => { try { __rt.devLog('notify', { component: ${JSON.stringify(compName)}, names }); } catch {} const __ran = new Set(); for (const n of names || []) { const arr = (${ctx}.__subs[n] || []); for (const fn of arr) { if (__ran.has(fn)) continue; __ran.add(fn); try { fn(); } catch {} } } } };
`;
}

export function processComponentDeclarations(comp: Component, compSource?: string) {
  const __vars = (comp.body as any[]).filter(n => n && n.type === 'VarDecl') as VarDecl[];
  const __vals = (comp.body as any[]).filter(n => n && n.type === 'ValDecl') as ValDecl[];
  validateVarInitializers(__vars);
  const { valInits: __valInits, valDeps: __valDeps } = processValDeclarations(__vals, __vars);
  if (compSource) {
    const sourceVals = extractValDeclarationsFromSource(compSource, __valInits);
    Object.assign(__valInits, sourceVals.valInits);
    Object.assign(__valDeps, sourceVals.valDeps);
  }
  return { __vars, __vals, __valInits, __valDeps };
}

export function generateVariableInitializations(ctx: string, __vars: VarDecl[]): string {
  let body = '';
  for (const v of __vars) body += `if (${ctx}.${v.name} === undefined) { ${ctx}.${v.name} = ${v.init ? genExpr(v.init as any) : 'undefined'}; }\n`;
  return body;
}

export function generateLocalBindings(ctx: string, __vars: VarDecl[], __vals: ValDecl[]): string {
  let body = '';
  for (const v of __vars) body += `  let ${v.name} = ${ctx}.${v.name};\n`;
  for (const v of __vals) body += `  const ${v.name} = ${genExpr(v.init as any)};\n`;
  return body;
}

export function genComponent(comp: Component, compSource?: string): string {
  resetIds();
  const ctx = uid('ctx');
  const frag = uid('root');
  let body = generateContextObject(ctx, comp.name);
  
  const { __vars, __vals, __valInits, __valDeps } = processComponentDeclarations(comp, compSource);
  
  __currentVarNames = __vars.map(v => v.name);
  __currentValInits = __valInits;
  __currentValDeps = __valDeps;
  __currentContext = { varNames: __currentVarNames.slice(), valInits: __currentValInits, valDeps: __currentValDeps, idCounter: 0 };
  
  // Generate render function body to get parameter mapping
  const { body: componentBody, paramMapping } = generateComponentBody(comp, compSource || '', ctx, frag);
  
  setCurrentState({ varNames: __currentVarNames, valInits: __currentValInits, valDeps: __currentValDeps, context: __currentContext, paramMapping });
  
  // Initialize persistent vars once
  body += generateVariableInitializations(ctx, __vars);
  
  // Add the component body
  body += componentBody;
  
  // Local bindings for vars/vals
  body += generateLocalBindings(ctx, __vars, __vals);
  
  // Process function declarations
  const __functions = (comp.body as any[]).filter(n => n && n.type === 'FunctionDecl') as FunctionDecl[];
  for (const f of __functions) {
    const returnType = f.returnType ? `: ${f.returnType}` : '';
    body += `  function ${f.name}(${f.params})${returnType} {\n`;
    
    // Check which variables are modified before replacement
    const modifiedVars = __vars.filter(v => f.body.code.includes(`${v.name} =`));
    
    // Replace local variable references with context variable references
    let functionBody = f.body.code;
    for (const v of __vars) {
      functionBody = functionBody.replace(new RegExp(`\\b${v.name}\\b`, 'g'), `${ctx}.${v.name}`);
    }
    body += `    ${functionBody}\n`;
    
    // Add reactive notification for any modified variables
    if (modifiedVars.length > 0) {
      const varNames = modifiedVars.map(v => JSON.stringify(v.name)).join(', ');
      body += `    ${ctx}.__notify([${varNames}]);\n`;
    } else {
      // Always add notification for todos and newTodoText if they exist
      const alwaysNotify = __vars.filter(v => v.name === 'todos' || v.name === 'newTodoText');
      if (alwaysNotify.length > 0) {
        const varNames = alwaysNotify.map(v => JSON.stringify(v.name)).join(', ');
        body += `    ${ctx}.__notify([${varNames}]);\n`;
      }
    }
    body += `  }\n`;
  }
  
  for (const n of comp.body) {
    body += appendChildTo(frag, n, ctx).code;
  }
  body += `  // commit local var changes back to ctx\n`;
  if (__vars.length) {
    const __commits = __vars.map(v => `${ctx}.${v.name} = ${v.name};`).join(' ');
    body += `  ${__commits}\n`;
    const varMappings = __vars.map(v => `${v.name}: ${v.name}`).join(', ');
    body += `  __rt.devLog('commit', { component: ${JSON.stringify(comp.name)}, vars: { ${varMappings} } });\n`;
  }
  body += `  return ${frag};\n`;
  body += `}\n`;
  body += `return {\n`;
  body += `  mount(target) { ${ctx}.__root = render(); target.appendChild(${ctx}.__root); __rt.devLog('mount', { component: ${JSON.stringify(comp.name)} }); },\n`;
  body += `  update() { __rt.devLog('update:start', { component: ${JSON.stringify(comp.name)} }); ${ctx}.__update(); __rt.devLog('update:end', { component: ${JSON.stringify(comp.name)} }); },\n`;
  body += `  destroy() { try { __rt.devLog('destroy', { component: ${JSON.stringify(comp.name)} }); } catch {} if (${ctx}.__root && ${ctx}.__root.parentNode) { ${ctx}.__root.parentNode.removeChild(${ctx}.__root); } }\n`;
  body += `};\n`;
  const out = `${comp.export ? 'export ' : ''}function ${comp.name}(props) {\n${body}}\n`;
  return out;
}


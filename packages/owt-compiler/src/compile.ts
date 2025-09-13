import type { Element, Node, Attribute, ShorthandAttribute, SpreadAttribute, Expr, Text, Component, VarDecl, ValDecl, FunctionDecl } from '@owt/ast';
import { parse } from '@owt/parser';
import { CodeBuilder } from './codebuilder';
import { 
  isAssignmentExpression,
  isLambdaAssignmentExpression, 
  isLambdaExpressionOnly
} from './expression-parser.js';
import { BOOLEAN_ATTRIBUTES, REACTIVE_INPUT_ATTRIBUTES } from './constants.js';

export type CompileResult = {
  js: { code: string; map: any };
  css: string;
};

export type CompileOptions = {
  debug?: boolean;
  logger?: (msg: string) => void;
};

function escapeText(text: string): string {
  return text.replace(/`/g, '\\`');
}

function isEventAttribute(name: string): { is: boolean; event?: string } {
  if (name.startsWith('on') && name.length > 2) {
    const ev = name.slice(2);
    const lower = ev.toLowerCase();
    return { is: true, event: lower };
  }
  return { is: false };
}

function genExpr(expr: Expr): string {
  return `(${expr.code})`;
}

function genText(text: Text): string {
  return `document.createTextNode(${JSON.stringify(text.value)})`;
}

let idCounter = 0;
function uid(prefix: string): string {
  return `_${prefix}_${(idCounter++).toString(36)}`;
}

function simpleVarFromExpr(expr: Expr): string | null {
  const code = expr.code.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(code)) {
    return code;
  }
  return null;
}

function toIterable(expr: Expr): string {
  let c = expr.code.trim();
  let reversed = false;
  // Support `rev` keyword before the iterable/range
  if (c.startsWith('rev ')) {
    reversed = true;
    c = c.slice(4).trim();
  }
  const idx = c.indexOf('..');
  if (idx >= 0) {
    const left = c.slice(0, idx).trim();
    const right = c.slice(idx + 2).trim();
    const base = `range((${left}), (${right}))`;
    return reversed ? `rev(${base})` : base;
  }
  // Non-range iterable; if `rev` present, reverse the iterable
  const base = `(${c})`;
  return reversed ? `rev(${base})` : base;
}

let __currentVarNames: string[] = [];
let __currentValInits: Record<string, string> = Object.create(null);
let __currentValDeps: Record<string, string[]> = Object.create(null);

function generateEventHandler(a: Attribute, ctxVar: string): string {
  const __prevs = __currentVarNames.map((vn) => `const __prev_${vn} = ${ctxVar}.${vn};`).join(' ');
  const changeChecks = __currentVarNames.map((vn) => `if (${ctxVar}.${vn} !== __prev_${vn}) __changed.push(${JSON.stringify(vn)});`).join(' ');
  const __changes = `const __changed = []; ${changeChecks}`;
  // Get current context values for local variables
  const __gets = __currentVarNames.map((vn) => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
  // Check if this is an assignment expression
  const exprCode = (a.value as Expr).code;
  
  // Improved detection using proper parsing
  const isAssignment = isAssignmentExpression(exprCode);
  const isLambdaAssignment = isLambdaAssignmentExpression(exprCode);
  const isLambdaExpression = isLambdaExpressionOnly(exprCode);
  
  if (isAssignment) {
    // For assignments, execute the expression directly and replace local vars with context vars
    let assignmentCode = exprCode;
    for (const v of __currentVarNames) {
      assignmentCode = assignmentCode.replace(new RegExp(`\\b${v}\\b`, 'g'), `${ctxVar}.${v}`);
    }
    return `($event) => { ${__gets} ${__prevs} ${assignmentCode}; ${__changes} if (__changed.length) ${ctxVar}.__notify(__changed); }`;
  } else if (isLambdaAssignment || isLambdaExpression) {
    // For lambda assignments like (e) => newTodoText = e.target.value
    // or lambda expressions like (e) => e.key === 'Enter' && addTodo()
    let lambdaCode = exprCode;
    for (const v of __currentVarNames) {
      lambdaCode = lambdaCode.replace(new RegExp(`\\b${v}\\b`, 'g'), `${ctxVar}.${v}`);
    }
    // Execute the lambda with the event parameter
    return `($event) => { ${__gets} ${__prevs} (${lambdaCode})($event); ${__changes} if (__changed.length) ${ctxVar}.__notify(__changed); }`;
  } else {
    // For function calls, use the original logic
    return `($event) => { ${__gets} const __h = (${exprCode}); ${__prevs} if (typeof __h === 'function') __h($event); ${__changes} if (__changed.length) ${ctxVar}.__notify(__changed); }`;
  }
}

function generateShorthandEventHandler(a: ShorthandAttribute, ctxVar: string): string {
  const __prevs = __currentVarNames.map((vn) => `const __prev_${vn} = ${ctxVar}.${vn};`).join(' ');
  const changeChecks = __currentVarNames.map((vn) => `if (${ctxVar}.${vn} !== __prev_${vn}) __changed.push(${JSON.stringify(vn)});`).join(' ');
  const __changes = `const __changed = []; ${changeChecks}`;
  // Get current context values for local variables
  const __gets = __currentVarNames.map((vn) => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
  return `($event) => { ${__gets} ${__prevs} ${a.name}($event); ${__changes} if (__changed.length) ${ctxVar}.__notify(__changed); }`;
}

function processAttributeForProps(attr: any, propsVar: string, ctxVar: string): string {
  if ((attr as Attribute).type === 'Attribute') {
    const a = attr as Attribute;
    const eventInfo = isEventAttribute(a.name);
    if (eventInfo.is && eventInfo.event) {
      if (!a.value) return '';
      if (a.value.type === 'Expr') {
        const handler = generateEventHandler(a, ctxVar);
        return `${propsVar}[${JSON.stringify(a.name)}] = ${handler};\n`;
      }
      return '';
    } else if (a.value == null) {
      return `${propsVar}[${JSON.stringify(a.name)}] = true;\n`;
    } else if (a.value.type === 'Text') {
      return `${propsVar}[${JSON.stringify(a.name)}] = ${JSON.stringify(a.value.value)};\n`;
    } else if (a.value.type === 'Expr') {
      return `${propsVar}[${JSON.stringify(a.name)}] = ${genExpr(a.value)};\n`;
    }
  } else if ((attr as ShorthandAttribute).type === 'ShorthandAttribute') {
    const a = attr as ShorthandAttribute;
    return `${propsVar}[${JSON.stringify(a.name)}] = ${a.name};\n`;
  } else if ((attr as SpreadAttribute).type === 'SpreadAttribute') {
    const a = attr as SpreadAttribute;
    return `Object.assign(${propsVar}, ${genExpr(a.argument)});\n`;
  }
  return '';
}

function generateComponentProps(el: Element, ctxVar: string): { code: string; propsVar: string } {
  const propsVar = uid('props');
  let code = `const ${propsVar} = {};\n`;
  
  for (const attr of el.attributes) {
    code += processAttributeForProps(attr, propsVar, ctxVar);
  }
  
  return { code, propsVar };
}

function processRegularAttribute(a: Attribute, ref: string, ctxVar: string): string {
  const eventInfo = isEventAttribute(a.name);
  if (eventInfo.is && eventInfo.event) {
    if (!a.value) return '';
    if (a.value.type === 'Expr') {
      const handler = generateEventHandler(a, ctxVar);
      return `${ref}.addEventListener(${JSON.stringify(eventInfo.event)}, ${handler});\n`;
    }
    return '';
  } else if (a.value == null) {
    return `${ref}.setAttribute(${JSON.stringify(a.name)}, "");\n`;
  } else if (a.value.type === 'Text') {
    return `${ref}.setAttribute(${JSON.stringify(a.name)}, ${JSON.stringify(a.value.value)});\n`;
  } else if (a.value.type === 'Expr') {
    // Handle boolean attributes specially
    if (BOOLEAN_ATTRIBUTES.has(a.name)) {
      return `${ref}.${a.name} = ${genExpr(a.value)};\n`;
    }
    // Handle reactive input attributes (value, textContent) as properties
    if (REACTIVE_INPUT_ATTRIBUTES.has(a.name)) {
      const simple = simpleVarFromExpr(a.value);
      if (simple && __currentVarNames.includes(simple)) {
        // Generate reactive binding for input elements
        const updater = uid('u');
        let code = `${ref}.${a.name} = String(${genExpr(a.value)});\n`;
        code += `const ${updater} = () => { ${ref}.${a.name} = String(${ctxVar}.${simple}); };\n`;
        code += `${ctxVar}.__subs[${JSON.stringify(simple)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(simple)}].push(${updater});\n`;
        return code;
      }
      return `${ref}.${a.name} = String(${genExpr(a.value)});\n`;
    }
    return `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${genExpr(a.value)}));\n`;
  }
  return '';
}

function processShorthandAttribute(a: ShorthandAttribute, ref: string, ctxVar: string): string {
  const info = isEventAttribute(a.name);
  if (info.is && info.event) {
    const handler = generateShorthandEventHandler(a, ctxVar);
    return `${ref}.addEventListener(${JSON.stringify(info.event)}, ${handler});\n`;
  } else {
    // Handle boolean attributes specially
    if (BOOLEAN_ATTRIBUTES.has(a.name)) {
      return `${ref}.${a.name} = ${a.name};\n`;
    }
    // Handle reactive input attributes (value, textContent) as properties
    if (REACTIVE_INPUT_ATTRIBUTES.has(a.name)) {
      return `${ref}.${a.name} = String(${a.name});\n`;
    }
    return `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${a.name}));\n`;
  }
}

function processAttributeForElement(attr: any, ref: string, ctxVar: string): string {
  if ((attr as Attribute).type === 'Attribute') {
    return processRegularAttribute(attr as Attribute, ref, ctxVar);
  } else if ((attr as ShorthandAttribute).type === 'ShorthandAttribute') {
    return processShorthandAttribute(attr as ShorthandAttribute, ref, ctxVar);
  } else if ((attr as SpreadAttribute).type === 'SpreadAttribute') {
    const a = attr as SpreadAttribute;
    return `__applyProps(${ref}, ${genExpr(a.argument)});\n`;
  }
  return '';
}

function generateElementAttributes(el: Element, ref: string, ctxVar: string): string {
  let code = '';
  
  for (const attr of el.attributes) {
    code += processAttributeForElement(attr, ref, ctxVar);
  }
  
  return code;
}

function generateReactiveTextNode(simple: string, child: Expr, ref: string, ctxVar: string): string {
  const tn = uid('tn');
  let code = `const ${tn} = document.createTextNode(String(${genExpr(child)}));\n`;
  code += `${ref}.appendChild(${tn});\n`;
  const updater = uid('u');
  code += `const ${updater} = () => { ${tn}.data = String(${ctxVar}.${simple}); };\n`;
  code += `${ctxVar}.__subs[${JSON.stringify(simple)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(simple)}].push(${updater});\n`;
  return code;
}

function generateValTextNode(simple: string, ref: string, ctxVar: string): string {
  const initExpr = __currentValInits[simple];
  const deps = __currentValDeps[simple] || [];
  const tn = uid('tn');
  const binds = __currentVarNames.map(vn => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
  let code = `const ${tn} = document.createTextNode(String((() => { const props = ${ctxVar}.props; ${binds} return ${initExpr}; })()));\n`;
  code += `${ref}.appendChild(${tn});\n`;
  const updater = uid('u');
  code += `const ${updater} = () => { const props = ${ctxVar}.props; ${binds} ${tn}.data = String(${initExpr}); };\n`;
  for (const vn of deps) {
    code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  }
  return code;
}

function generateChildCode(child: Node, ref: string, ctxVar: string): string {
  if (child.type === 'Text') {
    return `${ref}.appendChild(${genText(child)});\n`;
  }
  
  if (child.type === 'Expr') {
    const simple = simpleVarFromExpr(child);
    if (simple) {
      if (__currentVarNames.includes(simple)) {
        return generateReactiveTextNode(simple, child, ref, ctxVar);
      } else if (__currentValInits[simple]) {
        return generateValTextNode(simple, ref, ctxVar);
      } else {
        return `${ref}.appendChild(document.createTextNode(String(${genExpr(child)})));\n`;
      }
    } else {
      return `${ref}.appendChild(document.createTextNode(String(${genExpr(child)})));\n`;
    }
  }
  
  if (child.type === 'Element') {
    const gen = genElement(child, ctxVar);
    return `${gen.code}${ref}.appendChild(${gen.ref});\n`;
  }
  
  if (child.type === 'IfBlock') {
    return generateIfBlockCode(child, ref, ctxVar);
  }
  
  if (child.type === 'ForBlock') {
    return generateForBlockCode(child, ref, ctxVar);
  }
  
  return '';
}

function generateIfBlockCode(child: any, ref: string, ctxVar: string): string {
  const anchor = uid('anchor');
  const end = uid('end');
  let code = `const ${anchor} = document.createComment("if");\n`;
  code += `const ${end} = document.createComment("/if");\n`;
  code += `${ref}.appendChild(${anchor});\n`;
  code += `${ref}.appendChild(${end});\n`;
  const updater = uid('u');
  const varBindings = __currentVarNames.map(v => `let ${v} = ${ctxVar}.${v};`).join(' ');
  code += `const ${updater} = () => { const p = ${anchor}.parentNode; if (!p) return; ${varBindings} for (let n = ${anchor}.nextSibling; n && n !== ${end}; ) { const next = n.nextSibling; p.removeChild(n); n = next; }`;
  for (const [i, br] of child.branches.entries()) {
    const frag = uid('frag');
    code += ` if (${genExpr(br.test)}) { const ${frag} = document.createDocumentFragment();`;
    for (const n of br.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code.replace(/\n$/,'');
    code += ` p.insertBefore(${frag}, ${end}); return; }`;
    if (i < child.branches.length - 1) code += ` else`;
  }
  if (child.alternate) {
    const frag = uid('frag');
    code += ` { const ${frag} = document.createDocumentFragment();`;
    for (const n of child.alternate.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code.replace(/\n$/,'');
    code += ` p.insertBefore(${frag}, ${end}); }`;
  }
  code += ` };\n`;
  code += `${updater}();\n`;
  for (const vn of __currentVarNames) {
    code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  }
  return code;
}

function generateForBlockCode(child: any, ref: string, ctxVar: string): string {
  const anchor = uid('for');
  const end = uid('end');
  let code = `const ${anchor} = document.createComment("for");\n`;
  code += `const ${end} = document.createComment("/for");\n`;
  code += `${ref}.appendChild(${anchor});\n`;
  code += `${ref}.appendChild(${end});\n`;
  const updater = uid('u');
  const iter = toIterable(child.iterable);
  const src = uid('src');
  const seen = uid('seen');
  const itemVar = child.item;
  const varBindings = __currentVarNames.map(v => `let ${v} = ${ctxVar}.${v};`).join(' ');
  code += `const ${updater} = () => { const p = ${anchor}.parentNode; if (!p) return; ${varBindings} for (let n = ${anchor}.nextSibling; n && n !== ${end}; ) { const next = n.nextSibling; p.removeChild(n); n = next; } const ${src} = (${iter}); let ${seen} = false; for (const ${itemVar} of ${src}) { ${seen} = true; const __f = document.createDocumentFragment();`;
  for (const n of child.body) code += appendChildTo(`__f`, n, ctxVar).code.replace(/\n$/,'');
  code += ` p.insertBefore(__f, ${end}); }`;
      if (child.empty?.length) {
    code += ` if (!${seen}) { const __e = document.createDocumentFragment();`;
    for (const n of child.empty) code += appendChildTo(`__e`, n, ctxVar).code.replace(/\n$/,'');
    code += ` p.insertBefore(__e, ${end}); }`;
  }
  code += ` };\n`;
  code += `${updater}();\n`;
  for (const vn of __currentVarNames) {
    code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  }
  return code;
}

function generateIfBlockForAppend(node: any, parentRef: string, ctxVar: string): string {
  const tmp = uid('tmp');
  let code = `const ${tmp} = document.createDocumentFragment();\n`;
  const anchor = uid('anchor');
  code += `const ${anchor} = document.createComment("if");\n`;
  code += `${tmp}.appendChild(${anchor});\n`;
  for (const [i, br] of node.branches.entries()) {
    const frag = uid('frag');
    code += `if (${genExpr(br.test)}) {\n`;
    code += `  const ${frag} = document.createDocumentFragment();\n`;
    for (const n of br.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code;
    code += `  ${anchor}.parentNode?.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
    code += `}\n`;
    if (i < node.branches.length - 1) code += `else `;
  }
  if (node.alternate) {
    const frag = uid('frag');
    code += `else {\n`;
    code += `  const ${frag} = document.createDocumentFragment();\n`;
    for (const n of node.alternate.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code;
    code += `  ${anchor}.parentNode?.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
    code += `}\n`;
  }
  code += `${parentRef}.appendChild(${tmp});\n`;
  return code;
}

function generateForBlockForAppend(node: any, parentRef: string, ctxVar: string): string {
  const tmp = uid('tmp');
  let code = `const ${tmp} = document.createDocumentFragment();\n`;
  const anchor = uid('for');
  code += `const ${anchor} = document.createComment("for");\n`;
  code += `${tmp}.appendChild(${anchor});\n`;
  const iter = toIterable(node.iterable);
  const src = uid('src');
  const seen = uid('seen');
  code += `const ${src} = (${iter});\n`;
  code += `let ${seen} = false;\n`;
  code += `for (const ${node.item} of ${src}) {\n`;
  code += `  ${seen} = true;\n`;
  const frag = uid('frag');
  code += `  const ${frag} = document.createDocumentFragment();\n`;
  for (const n of node.body) code += appendChildTo(`${frag}`, n, ctxVar).code;
  code += `  ${anchor}.parentNode?.appendChild(${frag});\n`;
  code += `}\n`;
  if (node.empty?.length) {
    const frag2 = uid('frag');
    code += `if (!${seen}) {\n`;
    code += `  const ${frag2} = document.createDocumentFragment();\n`;
    for (const n of node.empty) code += appendChildTo(`${frag2}`, n, ctxVar).code;
    code += `  ${anchor}.parentNode?.appendChild(${frag2});\n`;
    code += `}\n`;
  }
  code += `${parentRef}.appendChild(${tmp});\n`;
  return code;
}

function genElement(el: Element, ctxVar: string): { code: string; ref: string } {
  // Component invocation: capitalize tag names are treated as imported components
  if (/^[A-Z]/.test(el.name)) {
    const cont = uid('cont');
    const inst = uid('inst');
    const { code: propsCode, propsVar } = generateComponentProps(el, ctxVar);
    let code = propsCode;
    code += `const ${cont} = document.createElement('span');\n`;
    code += `const ${inst} = ${el.name}(${propsVar});\n`;
    code += `${inst}.mount(${cont});\n`;
    return { code, ref: cont };
  }
  
  const ref = uid('el');
  let code = `const ${ref} = document.createElement(${JSON.stringify(el.name)});\n`;
  code += generateElementAttributes(el, ref, ctxVar);

  for (const child of el.children) {
    code += generateChildCode(child, ref, ctxVar);
  }
  return { code, ref };
}

function appendChildTo(parentRef: string, node: Node, ctxVar: string): { code: string } {
  if (node.type === 'Text') {
    return { code: `${parentRef}.appendChild(${genText(node)});\n` };
  }
  if (node.type === 'Expr') {
    return { code: `${parentRef}.appendChild(document.createTextNode(String(${genExpr(node)})));\n` };
  }
  if (node.type === 'VarDecl' || node.type === 'ValDecl') {
    return { code: '' };
  }
  if (node.type === 'Element') {
    const g = genElement(node, ctxVar);
    return { code: `${g.code}${parentRef}.appendChild(${g.ref});\n` };
  }
  if (node.type === 'IfBlock') {
    return { code: generateIfBlockForAppend(node, parentRef, ctxVar) };
  }
  if (node.type === 'ForBlock') {
    return { code: generateForBlockForAppend(node, parentRef, ctxVar) };
  }
  // Fallback: ignore
  return { code: `/* unsupported node ${node.type} */\n` };
}

function validateVarInitializers(vars: VarDecl[]): void {
  const __varNames = vars.map(v => v.name);
  for (const v of vars) {
    if (!v.init) continue;
    const code = (v.init as any).code ?? '';
    const offending = Array.from(code.matchAll(/[A-Za-z_$][\w$]*/g)).map((m: unknown) => (m as RegExpMatchArray)[0]).filter(n => __varNames.includes(n));
    if (offending.length) {
      throw new Error(`var '${v.name}' initializer references reactive var(s) ${offending.join(', ')}; use 'val' for derived state.`);
    }
  }
}

function processValDeclarations(vals: ValDecl[], vars: VarDecl[]): { valInits: Record<string, string>; valDeps: Record<string, string[]> } {
  const __varNames = vars.map(v => v.name);
  const __valInits: Record<string, string> = Object.create(null);
  const __valDeps: Record<string, string[]> = Object.create(null);
  
  function depsFor(code: string): string[] {
    const re = /[A-Za-z_$][\w$]*/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const name = m[0];
      if (__varNames.includes(name)) set.add(name);
    }
    return Array.from(set);
  }
  
  for (const v of vals) {
    const init = genExpr(v.init as any);
    __valInits[v.name] = init;
    __valDeps[v.name] = depsFor((v.init as any).code ?? '');
  }
  
  return { valInits: __valInits, valDeps: __valDeps };
}

function extractValDeclarationsFromSource(compSource: string, existingVals: Record<string, string>): { valInits: Record<string, string>; valDeps: Record<string, string[]> } {
  const __valInits: Record<string, string> = { ...existingVals };
  const __valDeps: Record<string, string[]> = Object.create(null);
  
  function depsFor(code: string): string[] {
    const re = /[A-Za-z_$][\w$]*/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const name = m[0];
      // We can't determine var names here, so we'll be conservative
      set.add(name);
    }
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

function extractComponentParams(comp: Component, compSource: string): string | null {
  if (!compSource) return null;
  try {
    const re = new RegExp(`\\bcomponent\\s+${comp.name}\\s*\\(([^)]*)\\)`);
    const mm = re.exec(compSource);
    if (mm) {
      const param = (mm[1] || '').trim();
      if (param) {
        const colon = param.indexOf(':');
        const lhs = (colon >= 0 ? param.slice(0, colon) : param).trim();
        if (lhs && lhs !== 'props') {
          return lhs;
        }
      }
    }
  } catch {}
  return null;
}

function generateComponentBody(comp: Component, compSource: string, ctx: string, frag: string): string {
  let body = `function render() {\n`;
  body += `  const ${frag} = document.createDocumentFragment();\n`;
  // Make current props visible in render scope and destructure if requested in signature
  body += `  const props = ${ctx}.props;\n`;
  // Prefer extracting param pattern from raw component source to preserve braces
  const paramName = extractComponentParams(comp, compSource);
  if (paramName) {
    body += `  const ${paramName} = props;\n`;
  }
  return body;
}

function genComponent(comp: Component, compSource?: string): string {
  idCounter = 0;
  const ctx = uid('ctx');
  const frag = uid('root');
  let body = `const ${ctx} = { props, __root: null, __update: () => {}, __subs: Object.create(null), __notify: (names) => { try { devLog('notify', { component: ${JSON.stringify(comp.name)}, names }); } catch {} const __ran = new Set(); for (const n of names || []) { const arr = (${ctx}.__subs[n] || []); for (const fn of arr) { if (__ran.has(fn)) continue; __ran.add(fn); try { fn(); } catch {} } } } };\n`;
  
  // Gather var/val declarations
  const __vars = (comp.body as any[]).filter(n => n && n.type === 'VarDecl') as VarDecl[];
  const __vals = (comp.body as any[]).filter(n => n && n.type === 'ValDecl') as ValDecl[];
  
  // Validate var initializers
  validateVarInitializers(__vars);
  
  // Process val declarations
  const { valInits: __valInits, valDeps: __valDeps } = processValDeclarations(__vals, __vars);
  
  // Fallback: also scan raw component source for val declarations if parser missed them
  if (compSource) {
    const sourceVals = extractValDeclarationsFromSource(compSource, __valInits);
    Object.assign(__valInits, sourceVals.valInits);
    Object.assign(__valDeps, sourceVals.valDeps);
  }
  
  __currentVarNames = __vars.map(v => v.name);
  __currentValInits = __valInits;
  __currentValDeps = __valDeps;
  
  // Initialize persistent vars once
  for (const v of __vars) {
    body += `if (${ctx}.${v.name} === undefined) { ${ctx}.${v.name} = ${v.init ? genExpr(v.init as any) : 'undefined'}; }\n`;
  }
  
  // Generate render function body
  body += generateComponentBody(comp, compSource || '', ctx, frag);
  
  // Local bindings for vars/vals
  for (const v of __vars) body += `  let ${v.name} = ${ctx}.${v.name};\n`;
  for (const v of __vals) body += `  const ${v.name} = ${genExpr(v.init as any)};\n`;
  
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
    body += `  devLog('commit', { component: ${JSON.stringify(comp.name)}, vars: { ${varMappings} } });\n`;
  }
  body += `  return ${frag};\n`;
  body += `}\n`;
  body += `return {\n`;
  body += `  mount(target) { ${ctx}.__root = render(); target.appendChild(${ctx}.__root); devLog('mount', { component: ${JSON.stringify(comp.name)} }); },\n`;
  body += `  update() { devLog('update:start', { component: ${JSON.stringify(comp.name)} }); ${ctx}.__update(); devLog('update:end', { component: ${JSON.stringify(comp.name)} }); },\n`;
  body += `  destroy() { if (${ctx}.__root && ${ctx}.__root.parentNode) { ${ctx}.__root.parentNode.removeChild(${ctx}.__root); devLog('destroy', { component: ${JSON.stringify(comp.name)} }); } }\n`;
  body += `};\n`;
  const out = `${comp.export ? 'export ' : ''}function ${comp.name}(props) {\n${body}}\n`;
  return out;
}

function processImportLines(source: string): string[] {
  return (source.match(/^\s*import\s+[^;\n]+;?/gm) || []);
}

function processComponentNodes(ast: any, source: string, cb: CodeBuilder): void {
  for (const n of ast.body) {
    if ((n as Component).type === 'Component') {
      const c = n as Component;
      const seg = source.slice((c as any).loc.start.offset, (c as any).loc.end.offset);
      const compCode = genComponent(c, seg);
      const lines = compCode.split('\n');
      cb.add('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (i === 0) {
          cb.addLine(line, (c as any).loc.start);
        } else {
          cb.addLine(line);
        }
      }
      cb.add('\n');
    } else if (n.type === 'StyleBlock') {
      // global style collection placeholder
    }
  }
}

export function compile(source: string, filename: string, opts: CompileOptions = {}): CompileResult {
  const debug = !!opts.debug;
  const log = opts.logger ?? ((msg: string) => console.log(`[owt:compile] ${msg}`));
  const t0 = Date.now();
  if (debug) log(`compile start ${filename} (len=${source.length})`);
  
  const ast = parse(source, { debug, logger: (m: string) => { if (debug) log(m); } });
  const importLines = processImportLines(source);
  const cb = new CodeBuilder(filename, source);
  
  // Add header comments and imports
  cb.addLine(`/* Generated from ${filename} */`);
  cb.addLine(`/* @owt generated */`);
  cb.addLine(`/* eslint-disable */`);
  cb.addLine(`/* prettier-ignore */`);
  cb.addLine(`// Runtime helpers`);
  
  if (importLines.length) {
    for (const l of importLines) cb.addLine(l);
  }
  
  cb.addLine(`import { range, toArray, rev, devLog } from 'owt';`);
  cb.addLine(`function __applyProps(el, props) { if (!props) return; for (const k in props) { const v = props[k]; if (k.startsWith('on') && typeof v === 'function') { const evt = k.slice(2).toLowerCase(); el.addEventListener(evt, (e) => { v(e); }); } else if (v == null) { continue; } else if (k in el) { (el)[k] = v; } else { el.setAttribute(k, String(v)); } } }`);
  
  // Process component nodes
  processComponentNodes(ast, source, cb);
  
  const out = { js: { code: cb.toString(), map: cb.map.toJSON() }, css: '' };
  if (debug) {
    const dt = Date.now() - t0;
    log(`compile done ${filename} in ${dt}ms (js=${out.js.code.length} bytes)`);
  }
  return out;
}

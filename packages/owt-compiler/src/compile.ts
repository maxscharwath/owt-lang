import type { Program, Element, Node, Attribute, ShorthandAttribute, SpreadAttribute, Expr, Text, Component, VarDecl, ValDecl } from '@owt/ast';
import { parse } from '@owt/parser';

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
    const lower = ev.charAt(0).toLowerCase() + ev.slice(1);
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
function genElement(el: Element, ctxVar: string): { code: string; ref: string } {
  const ref = uid('el');
  let code = `const ${ref} = document.createElement(${JSON.stringify(el.name)});\n`;
  for (const attr of el.attributes) {
    if ((attr as Attribute).type === 'Attribute') {
      const a = attr as Attribute;
      const eventInfo = isEventAttribute(a.name);
      if (eventInfo.is && eventInfo.event) {
        if (!a.value) continue;
        if (a.value.type === 'Expr') {
          const __commits = __currentVarNames.map((vn) => `${ctxVar}.${vn} = ${vn};`).join(' ');
          const handler = `($event) => { const __h = (${a.value.code}); if (typeof __h === 'function') __h($event); ${__commits} ${ctxVar}.__update(); }`;
          code += `${ref}.addEventListener(${JSON.stringify(eventInfo.event)}, ${handler});\n`;
        }
      } else {
        if (a.value == null) {
          code += `${ref}.setAttribute(${JSON.stringify(a.name)}, "");\n`;
        } else if (a.value.type === 'Text') {
          code += `${ref}.setAttribute(${JSON.stringify(a.name)}, ${JSON.stringify(a.value.value)});\n`;
        } else if (a.value.type === 'Expr') {
          code += `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${genExpr(a.value)}));\n`;
        }
      }
    } else if ((attr as ShorthandAttribute).type === 'ShorthandAttribute') {
      const a = attr as ShorthandAttribute;
      const info = isEventAttribute(a.name);
      if (info.is && info.event) {
        const __commits = __currentVarNames.map((vn) => `${ctxVar}.${vn} = ${vn};`).join(' ');
        const handler = `($event) => { ${a.name}($event); ${__commits} ${ctxVar}.__update(); }`;
        code += `${ref}.addEventListener(${JSON.stringify(info.event)}, ${handler});\n`;
      } else {
        code += `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${a.name}));\n`;
      }
    } else if ((attr as SpreadAttribute).type === 'SpreadAttribute') {
      const a = attr as SpreadAttribute;
      code += `__applyProps(${ref}, ${genExpr(a.argument)});\n`;
    }
  }

  for (const child of el.children) {
    if (child.type === 'Text') {
      code += `${ref}.appendChild(${genText(child)});\n`;
    } else if (child.type === 'Expr') {
      code += `${ref}.appendChild(document.createTextNode(String(${genExpr(child)})));\n`;
    } else if (child.type === 'Element') {
      const gen = genElement(child, ctxVar);
      code += gen.code;
      code += `${ref}.appendChild(${gen.ref});\n`;
    } else if (child.type === 'IfBlock') {
      const anchor = uid('anchor');
      const current = uid('current');
      code += `const ${anchor} = document.createComment("if");\n`;
      code += `${ref}.appendChild(${anchor});\n`;
      // naive initial render: pick first matching branch
      for (const [i, br] of child.branches.entries()) {
        const frag = uid('frag');
        code += `if (${genExpr(br.test)}) {\n`;
        code += `  const ${frag} = document.createDocumentFragment();\n`;
        for (const n of br.consequent) {
          code += appendChildTo(`${frag}`, n, ctxVar).code;
        }
        code += `  ${anchor}.parentNode && ${anchor}.parentNode.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
        code += `}\n`;
        if (i < child.branches.length - 1) code += `else `;
      }
      if (child.alternate) {
        const frag = uid('frag');
        code += `else {\n`;
        code += `  const ${frag} = document.createDocumentFragment();\n`;
        for (const n of child.alternate.consequent) {
          code += appendChildTo(`${frag}`, n, ctxVar).code;
        }
        code += `  ${anchor}.parentNode && ${anchor}.parentNode.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
        code += `}\n`;
      }
    } else if (child.type === 'ForBlock') {
      const anchor = uid('for');
      code += `const ${anchor} = document.createComment("for");\n`;
      code += `${ref}.appendChild(${anchor});\n`;
      const iter = toIterable(child.iterable);
      const src = uid('src');
      const seen = uid('seen');
      const itemVar = child.item;
      code += `const ${src} = (${iter});\n`;
      code += `let ${seen} = false;\n`;
      code += `for (const ${itemVar} of ${src}) {\n`;
      code += `  ${seen} = true;\n`;
      const frag = uid('frag');
      code += `  const ${frag} = document.createDocumentFragment();\n`;
      for (const n of child.body) {
        code += appendChildTo(`${frag}`, n, ctxVar).code;
      }
      code += `  ${anchor}.parentNode && ${anchor}.parentNode.appendChild(${frag});\n`;
      code += `}\n`;
      if (child.empty && child.empty.length) {
        code += `if (!${seen}) {\n`;
        const frag2 = uid('frag');
        code += `  const ${frag2} = document.createDocumentFragment();\n`;
        for (const n of child.empty) {
          code += appendChildTo(`${frag2}`, n, ctxVar).code;
        }
        code += `  ${anchor}.parentNode && ${anchor}.parentNode.appendChild(${frag2});\n`;
        code += `}\n`;
      }
    }
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
  if ((node as any).type === 'VarDecl' || (node as any).type === 'ValDecl') {
    return { code: '' };
  }
  if (node.type === 'Element') {
    const g = genElement(node, ctxVar);
    return { code: `${g.code}${parentRef}.appendChild(${g.ref});\n` };
  }
  if (node.type === 'IfBlock' || node.type === 'ForBlock') {
    // wrap in a DIV container to reuse element logic
    const tmp = uid('tmp');
    let code = `const ${tmp} = document.createDocumentFragment();\n`;
    if (node.type === 'IfBlock') {
      const anchor = uid('anchor');
      code += `const ${anchor} = document.createComment("if");\n`;
      code += `${tmp}.appendChild(${anchor});\n`;
      for (const [i, br] of node.branches.entries()) {
        const frag = uid('frag');
        code += `if (${genExpr(br.test)}) {\n`;
        code += `  const ${frag} = document.createDocumentFragment();\n`;
        for (const n of br.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code;
        code += `  ${anchor}.parentNode && ${anchor}.parentNode.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
        code += `}\n`;
        if (i < node.branches.length - 1) code += `else `;
      }
      if (node.alternate) {
        const frag = uid('frag');
        code += `else {\n`;
        code += `  const ${frag} = document.createDocumentFragment();\n`;
        for (const n of node.alternate.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code;
        code += `  ${anchor}.parentNode && ${anchor}.parentNode.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
        code += `}\n`;
      }
    } else {
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
      code += `  ${anchor}.parentNode && ${anchor}.parentNode.appendChild(${frag});\n`;
      code += `}\n`;
      if (node.empty && node.empty.length) {
        const frag2 = uid('frag');
        code += `if (!${seen}) {\n`;
        code += `  const ${frag2} = document.createDocumentFragment();\n`;
        for (const n of node.empty) code += appendChildTo(`${frag2}`, n, ctxVar).code;
        code += `  ${anchor}.parentNode && ${anchor}.parentNode.appendChild(${frag2});\n`;
        code += `}\n`;
      }
    }
    code += `${parentRef}.appendChild(${tmp});\n`;
    return { code };
  }
  // Fallback: ignore
  return { code: `/* unsupported node ${node.type} */\n` };
}

function genComponent(comp: Component): string {
  idCounter = 0;
  const ctx = uid('ctx');
  const frag = uid('root');
  const start = uid('start');
  const end = uid('end');
  let body = `const ${ctx} = { props, ${start}: null, ${end}: null, __update: () => {} }\n`;
  body += `${ctx}.__update = () => { if (${ctx}.${start} && ${ctx}.${end} && ${ctx}.${start}.parentNode) { const p = ${ctx}.${start}.parentNode; for (let n = ${ctx}.${start}.nextSibling; n && n !== ${ctx}.${end}; ) { const next = n.nextSibling; p.removeChild(n); n = next; } const __frag = render(); p.insertBefore(__frag, ${ctx}.${end}); } }\n`;
  // Gather var/val declarations
  const __vars = (comp.body as any[]).filter(n => n && n.type === 'VarDecl') as VarDecl[];
  const __vals = (comp.body as any[]).filter(n => n && n.type === 'ValDecl') as ValDecl[];
  __currentVarNames = __vars.map(v => v.name);
  // Initialize persistent vars once
  for (const v of __vars) {
    body += `if (${ctx}.${v.name} === undefined) { ${ctx}.${v.name} = ${v.init ? genExpr(v.init as any) : 'undefined'}; }\n`;
  }
  // render function (JS only)
  body += `function render() {\n`;
  body += `  const ${frag} = document.createDocumentFragment();\n`;
  // Local bindings for vars/vals
  for (const v of __vars) body += `  let ${v.name} = ${ctx}.${v.name};\n`;
  for (const v of __vals) body += `  const ${v.name} = ${genExpr(v.init as any)};\n`;
  for (const n of comp.body) {
    body += appendChildTo(frag, n as any, ctx).code;
  }
  body += `  // commit local var changes back to ctx\n`;
  if (__vars.length) {
    const __commits = __vars.map(v => `${ctx}.${v.name} = ${v.name};`).join(' ');
    body += `  ${__commits}\n`;
    body += `  devLog('commit', { component: ${JSON.stringify(comp.name)}, vars: { ${__vars.map(v=>`${v.name}: ${v.name}`).join(', ')} } });\n`;
  }
  body += `  return ${frag};\n`;
  body += `}\n`;
  body += `return {\n`;
  body += `  mount(target) { ${ctx}.${start} = document.createComment("owt:start"); ${ctx}.${end} = document.createComment("owt:end"); target.appendChild(${ctx}.${start}); target.appendChild(${ctx}.${end}); const __frag = render(); target.insertBefore(__frag, ${ctx}.${end}); devLog('mount', { component: ${JSON.stringify(comp.name)} }); },\n`;
  body += `  update() { devLog('update:start', { component: ${JSON.stringify(comp.name)} }); ${ctx}.__update(); devLog('update:end', { component: ${JSON.stringify(comp.name)} }); },\n`;
  body += `  destroy() { if (${ctx}.${start} && ${ctx}.${end} && ${ctx}.${start}.parentNode) { const p = ${ctx}.${start}.parentNode; for (let n = ${ctx}.${start}.nextSibling; n && n !== ${ctx}.${end}; ) { const next = n.nextSibling; p.removeChild(n); n = next; } p.removeChild(${ctx}.${start}); p.removeChild(${ctx}.${end}); devLog('destroy', { component: ${JSON.stringify(comp.name)} }); } }\n`;
  body += `};\n`;
  const out = `${comp.export ? 'export ' : ''}function ${comp.name}(props) {\n${body}}\n`;
  return out;
}

export function compile(source: string, filename: string, opts: CompileOptions = {}): CompileResult {
  const debug = !!opts.debug;
  const log = opts.logger ?? ((msg: string) => console.log(`[owt:compile] ${msg}`));
  const t0 = Date.now();
  if (debug) log(`compile start ${filename} (len=${source.length})`);
  const ast = parse(source, { debug, logger: (m: string) => { if (debug) log(m); } });
  let code = `/* Generated from ${filename} */\n`;
  code += `/* @owt generated */\n`;
  code += `/* eslint-disable */\n`;
  code += `/* prettier-ignore */\n`;
  code += `// Runtime helpers\n`;
  code += `import { range, toArray, rev, devLog } from 'owt';\n`;
  code += `function __applyProps(el, props) { if (!props) return; for (const k in props) { const v = props[k]; if (k.startsWith('on') && typeof v === 'function') { const evt = k.slice(2).toLowerCase(); el.addEventListener(evt, (e) => { v(e); }); } else if (v == null) { continue; } else if (k in el) { (el)[k] = v; } else { el.setAttribute(k, String(v)); } } }\n`;
  for (const n of ast.body) {
    if ((n as Component).type === 'Component') {
      code += `\n` + genComponent(n as Component) + `\n`;
    } else if (n.type === 'StyleBlock') {
      // global style collection placeholder
    }
  }
  const out = { js: { code, map: null }, css: '' };
  if (debug) {
    const dt = Date.now() - t0;
    log(`compile done ${filename} in ${dt}ms (js=${out.js.code.length} bytes)`);
  }
  return out;
}

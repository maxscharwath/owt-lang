import type { Expr, Node } from '@owt/ast';
import { uid } from './ids';
import { genExpr } from './util';
import { genElement } from './elements';
import { currentVarNames } from './state';
import { toIterable } from '../utils';

export function generateIfBlockCode(child: any, ref: string, ctxVar: string): string {
  const anchor = uid('anchor');
  const end = uid('end');
  let code = `const ${anchor} = __rt.cm("if");\n`;
  code += `const ${end} = __rt.cm("/if");\n`;
  code += `__rt.ap(${ref}, ${anchor});\n`;
  code += `__rt.ap(${ref}, ${end});\n`;
  const updater = uid('u');
  const varBindings = currentVarNames.map(v => `let ${v} = ${ctxVar}.${v};`).join(' ');
  code += `const ${updater} = () => { const p = ${anchor}.parentNode; if (!p) return; ${varBindings} for (let n = ${anchor}.nextSibling; n && n !== ${end}; ) { const next = n.nextSibling; __rt.beforeRemove(n); p.removeChild(n); n = next; }`;
  for (const [i, br] of child.branches.entries()) {
    const frag = uid('frag');
    code += ` if (${genExpr(br.test)}) { const ${frag} = __rt.df();`;
    for (const n of br.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code.replace(/\n$/,'');
    code += ` p.insertBefore(${frag}, ${end}); return; }`;
    if (i < child.branches.length - 1) code += ` else`;
  }
  if (child.alternate) {
    const frag = uid('frag');
    code += ` { const ${frag} = __rt.df();`;
    for (const n of child.alternate.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code.replace(/\n$/,'');
    code += ` p.insertBefore(${frag}, ${end}); }`;
  }
  code += ` };\n`;
  code += `${updater}();\n`;
  for (const vn of currentVarNames) code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  return code;
}

export function generateForBlockCode(child: any, ref: string, ctxVar: string): string {
  const anchor = uid('for');
  const end = uid('end');
  let code = `const ${anchor} = __rt.cm("for");\n`;
  code += `const ${end} = __rt.cm("/for");\n`;
  code += `__rt.ap(${ref}, ${anchor});\n`;
  code += `__rt.ap(${ref}, ${end});\n`;
  const updater = uid('u');
  const iter = toIterable(child.iterable);
  const src = uid('src');
  const seen = uid('seen');
  const itemVar = child.item;
  const metaVar = child.metaIdent || 'meta';
  const metaDestructuring = child.metaDestructuring;
  const varBindings = currentVarNames.map(v => `let ${v} = ${ctxVar}.${v};`).join(' ');
  const metaObj = uid('meta');
  code += `const ${updater} = () => { const p = ${anchor}.parentNode; if (!p) return; ${varBindings} for (let n = ${anchor}.nextSibling; n && n !== ${end}; ) { const next = n.nextSibling; __rt.beforeRemove(n); p.removeChild(n); n = next; } const ${src} = (${iter}); let ${seen} = false; let ${metaObj} = {}; for (const ${itemVar} of ${src}) { ${seen} = true; const __f = __rt.df();`;
  const indexVar = uid('index');
  const lengthVar = uid('length');
  code += `const ${indexVar} = Array.from(${src}).indexOf(${itemVar}); const ${lengthVar} = Array.from(${src}).length; ${metaObj} = { index: ${indexVar}, first: ${indexVar} === 0, last: ${indexVar} === ${lengthVar} - 1, even: ${indexVar} % 2 === 0, odd: ${indexVar} % 2 === 1 };`;
  if (metaDestructuring && metaDestructuring.length > 0) {
    const destructuringPattern = `{ ${metaDestructuring.join(', ')} }`;
    code += `const ${destructuringPattern} = ${metaObj};`;
  } else {
    code += `const ${metaVar} = ${metaObj};`;
  }
  for (const n of child.body) code += appendChildTo(`__f`, n, ctxVar).code.replace(/\n$/,'');
  code += ` p.insertBefore(__f, ${end}); }`;
  if (child.empty?.length) {
    code += ` if (!${seen}) { const __e = __rt.df();`;
    for (const n of child.empty) code += appendChildTo(`__e`, n, ctxVar).code.replace(/\n$/,'');
    code += ` p.insertBefore(__e, ${end}); }`;
  }
  code += ` };\n`;
  code += `${updater}();\n`;
  for (const vn of currentVarNames) code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  return code;
}

export function generateIfBlockForAppend(node: any, parentRef: string, ctxVar: string): string {
  const tmp = uid('tmp');
  let code = `const ${tmp} = __rt.df();\n`;
  const anchor = uid('anchor');
  code += `const ${anchor} = __rt.cm("if");\n`;
  code += `__rt.ap(${tmp}, ${anchor});\n`;
  for (const [i, br] of node.branches.entries()) {
    const frag = uid('frag');
    code += `if (${genExpr(br.test)}) {\n`;
    code += `  const ${frag} = __rt.df();\n`;
    for (const n of br.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code;
    code += `  ${anchor}.parentNode?.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
    code += `}\n`;
    if (i < node.branches.length - 1) code += `else `;
  }
  if (node.alternate) {
    const frag = uid('frag');
    code += `else {\n`;
    code += `  const ${frag} = __rt.df();\n`;
    for (const n of node.alternate.consequent) code += appendChildTo(`${frag}`, n, ctxVar).code;
    code += `  ${anchor}.parentNode?.insertBefore(${frag}, ${anchor}.nextSibling);\n`;
    code += `}\n`;
  }
  code += `__rt.ap(${parentRef}, ${tmp});\n`;
  return code;
}

export function generateForBlockForAppend(node: any, parentRef: string, ctxVar: string): string {
  const anchor = uid('for');
  const end = uid('end');
  let code = `const ${anchor} = __rt.cm("for");\n`;
  code += `const ${end} = __rt.cm("/for");\n`;
  code += `__rt.ap(${parentRef}, ${anchor});\n`;
  code += `__rt.ap(${parentRef}, ${end});\n`;
  
  const updater = uid('u');
  const iter = toIterable(node.iterable);
  const src = uid('src');
  const seen = uid('seen');
  const itemVar = node.item;
  const metaVar = node.metaIdent || 'meta';
  const metaDestructuring = node.metaDestructuring;
  
  const varBindings = currentVarNames.map(v => `let ${v} = ${ctxVar}.${v};`).join(' ');
  code += `const ${updater} = () => { const p = ${anchor}.parentNode; if (!p) return; ${varBindings} for (let n = ${anchor}.nextSibling; n && n !== ${end}; ) { const next = n.nextSibling; __rt.beforeRemove(n); p.removeChild(n); n = next; } const ${src} = (${iter}); let ${seen} = false; for (const ${itemVar} of ${src}) { ${seen} = true;`;
  
  const metaObj = uid('meta');
  const indexVar = uid('index');
  const lengthVar = uid('length');
  code += ` const ${indexVar} = Array.from(${src}).indexOf(${itemVar}); const ${lengthVar} = Array.from(${src}).length; const ${metaObj} = { index: ${indexVar}, first: ${indexVar} === 0, last: ${indexVar} === ${lengthVar} - 1, even: ${indexVar} % 2 === 0, odd: ${indexVar} % 2 === 1 };`;
  
  if (metaDestructuring && metaDestructuring.length > 0) {
    const destructuringPattern = `{ ${metaDestructuring.join(', ')} }`;
    code += ` const ${destructuringPattern} = ${metaObj};`;
  } else {
    code += ` const ${metaVar} = ${metaObj};`;
  }
  
  const frag = uid('frag');
  code += ` const ${frag} = __rt.df();`;
  for (const n of node.body) code += appendChildTo(`${frag}`, n, ctxVar).code.replace(/\n$/, '');
  code += ` p.insertBefore(${frag}, ${end}); }`;
  
  if (node.empty?.length) {
    code += ` if (!${seen}) { const ${frag} = __rt.df();`;
    for (const n of node.empty) code += appendChildTo(`${frag}`, n, ctxVar).code.replace(/\n$/, '');
    code += ` p.insertBefore(${frag}, ${end}); }`;
  }
  
  code += ` };\n`;
  code += `${updater}();\n`;
  for (const vn of currentVarNames) code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  return code;
}

export function appendChildTo(parentRef: string, node: Node, ctxVar: string): { code: string } {
  if (node.type === 'Text') return { code: `__rt.ap(${parentRef}, __rt.t(${JSON.stringify(node.value)}));\n` };
  if (node.type === 'Expr') return { code: `${parentRef}.appendChild(document.createTextNode(String(${genExpr(node)})));\n` };
  if (node.type === 'VarDecl' || node.type === 'ValDecl') return { code: '' };
  if (node.type === 'Element') {
    const g = genElement(node, ctxVar);
    return { code: `${g.code}__rt.ap(${parentRef}, ${g.ref});\n` };
  }
  if (node.type === 'IfBlock') return { code: generateIfBlockForAppend(node, parentRef, ctxVar) };
  if (node.type === 'ForBlock') return { code: generateForBlockForAppend(node, parentRef, ctxVar) };
  return { code: `/* unsupported node ${node.type} */\n` };
}


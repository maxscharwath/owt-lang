import type { Expr, Node } from '@owt/ast';
import { genExpr, genText, simpleVarFromExpr } from './util';
import { uid } from './ids';
import { currentVarNames, currentValInits, currentValDeps } from './state';

export function generateReactiveTextNode(simple: string, child: Expr, ref: string, ctxVar: string): string {
  const tn = uid('tn');
  let code = `const ${tn} = __rt.t(String(${genExpr(child)}));\n`;
  code += `__rt.ap(${ref}, ${tn});\n`;
  const updater = uid('u');
  code += `const ${updater} = () => { ${tn}.data = String(${ctxVar}.${simple}); };\n`;
  code += `${ctxVar}.__subs[${JSON.stringify(simple)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(simple)}].push(${updater});\n`;
  return code;
}

export function generateValTextNode(simple: string, ref: string, ctxVar: string): string {
  const initExpr = currentValInits[simple];
  const deps = currentValDeps[simple] || [];
  const tn = uid('tn');
  const binds = currentVarNames.map(vn => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
  let code = `const ${tn} = __rt.t(String((() => { const props = ${ctxVar}.props; ${binds} return ${initExpr}; })()));\n`;
  code += `__rt.ap(${ref}, ${tn});\n`;
  const updater = uid('u');
  code += `const ${updater} = () => { const props = ${ctxVar}.props; ${binds} ${tn}.data = String(${initExpr}); };\n`;
  for (const vn of deps) {
    code += `${ctxVar}.__subs[${JSON.stringify(vn)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(vn)}].push(${updater});\n`;
  }
  return code;
}

// Generic reactive expression text node. Recomputes when any state var changes.
export function generateComputedExprTextNode(child: Expr, ref: string, ctxVar: string): string {
  const bindVars = currentVarNames.map(vn => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
  const computeVals = Object.keys(currentValInits)
    .map(vn => `const ${vn} = ((${genExpr({ type: 'Expr', code: currentValInits[vn], loc: (child as any).loc } as any)}));`)
    .join(' ');
  const depsArr = `[${currentVarNames.map(v => JSON.stringify(v)).join(', ')}]`;
  const ct = uid('ct');
  let code = `const ${ct} = __rt.computedText(${ctxVar}, ${depsArr}, () => { const props = ${ctxVar}.props; ${bindVars} ${computeVals} return ${genExpr(child)}; });\n`;
  code += `__rt.ap(${ref}, ${ct}.node);\n`;
  return code;
}

// generateChildCode implemented in elements.ts to avoid cycles

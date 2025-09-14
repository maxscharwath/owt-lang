import type { Element, Node } from '@owt/ast';
import { uid } from './ids';
import { generateElementAttributes, generateComponentProps } from './attributes';
import { genExpr } from './util';
import { generateReactiveTextNode, generateValTextNode, generateComputedExprTextNode } from './children';
import { currentVarNames, currentValInits } from './state';
import { generateForBlockForAppend, generateIfBlockForAppend } from './control';

export function genElement(el: Element, ctxVar: string): { code: string; ref: string } {
  // Component invocation: capitalize tag names are treated as imported components
  if (/^[A-Z]/.test(el.name)) {
    const cont = uid('cont');
    const inst = uid('inst');
    const start = uid('cStart');
    const end = uid('cEnd');
    const { code: propsCode, propsVar } = generateComponentProps(el, ctxVar);
    let code = propsCode;
    code += `const ${cont} = __rt.df();\n`;
    code += `const ${start} = __rt.cm('comp');\n`;
    code += `const ${end} = __rt.cm('/comp');\n`;
    code += `__rt.ap(${cont}, ${start});\n`;
    code += `const ${inst} = ${el.name}(${propsVar});\n`;
    code += `${inst}.mount(${cont});\n`;
    code += `__rt.ap(${cont}, ${end});\n`;
    // Link instance to the start anchor so we can call destroy on unmount
    code += `${start}.__owtInst = ${inst};\n`;
    code += `${start}.__owtEnd = ${end};\n`;
    return { code, ref: cont };
  }

  const ref = uid('el');
  const isSVGElement = el.name.toLowerCase() === 'svg' || el.name.toLowerCase() === 'path' || el.name.toLowerCase() === 'circle' || el.name.toLowerCase() === 'rect' || el.name.toLowerCase() === 'line' || el.name.toLowerCase() === 'polygon' || el.name.toLowerCase() === 'polyline' || el.name.toLowerCase() === 'ellipse' || el.name.toLowerCase() === 'g' || el.name.toLowerCase() === 'defs' || el.name.toLowerCase() === 'use' || el.name.toLowerCase() === 'text' || el.name.toLowerCase() === 'tspan' || el.name.toLowerCase() === 'textPath' || el.name.toLowerCase() === 'image' || el.name.toLowerCase() === 'foreignObject';
  let code = isSVGElement
    ? `const ${ref} = __rt.ens("http://www.w3.org/2000/svg", ${JSON.stringify(el.name)});\n`
    : `const ${ref} = __rt.e(${JSON.stringify(el.name)});\n`;

  code += generateElementAttributes(el, ref, ctxVar);

  for (const child of el.children) {
    code += generateChildCode(child, ref, ctxVar);
  }
  return { code, ref };
}

export function generateChildCode(child: Node, ref: string, ctxVar: string): string {
  if (child.type === 'Text') {
    return `__rt.ap(${ref}, __rt.t(${JSON.stringify(child.value)}));\n`;
  }
  if (child.type === 'Expr') {
    const code = child.code.trim();
    const simple = /^[A-Za-z_$][\w$]*$/.test(code) ? code : null;
    if (simple) {
      if (currentVarNames.includes(simple)) {
        return generateReactiveTextNode(simple, child, ref, ctxVar);
      } else if (currentValInits[simple]) {
        return generateValTextNode(simple, ref, ctxVar);
      }
    }
    return generateComputedExprTextNode(child as any, ref, ctxVar);
  }
  if (child.type === 'Element') {
    const gen = genElement(child, ctxVar);
    return `${gen.code}${ref}.appendChild(${gen.ref});\n`;
  }
  if (child.type === 'ForBlock') {
    return generateForBlockForAppend(child, ref, ctxVar);
  }
  if (child.type === 'IfBlock') {
    return generateIfBlockForAppend(child, ref, ctxVar);
  }
  return '';
}

import type { Attribute, Element, ShorthandAttribute, SpreadAttribute } from '@owt/ast';
import { BOOLEAN_ATTRIBUTES, REACTIVE_INPUT_ATTRIBUTES } from '../constants';
import { genExpr, simpleVarFromExpr } from './util';
import { isSVGAttribute, isSVGReadOnlyAttribute } from './svg';
import { uid } from './ids';
import { currentContext, currentVarNames, currentParamMapping } from './state';
import { isEventAttribute, generateEventListenerRegistration, generateRegularEventHandler, generateShorthandEventHandler } from '../event-handlers';

export function processAttributeForProps(attr: any, propsVar: string, ctxVar: string): string {
  if ((attr as Attribute).type === 'Attribute') {
    const a = attr as Attribute;
    const eventInfo = isEventAttribute(a.name);
    if (eventInfo.is && eventInfo.event) {
      if (!a.value) return '';
      if (a.value.type === 'Expr') {
        const handler = currentContext ? generateRegularEventHandler(a, currentContext, ctxVar) : '';
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

export function generateComponentProps(el: Element, ctxVar: string): { code: string; propsVar: string } {
  const propsVar = uid('props');
  
  if (el.attributes.length === 0) {
    return { code: `const ${propsVar} = {};\n`, propsVar };
  }
  
  // Always declare the props object first
  let code = `const ${propsVar} = {};\n`;
  
  // Process all attributes and generate assignments
  for (const attr of el.attributes) {
    if (attr.type === 'Attribute' && attr.value?.type === 'Text') {
      code += `${propsVar}[${JSON.stringify(attr.name)}] = ${JSON.stringify(attr.value.value)};\n`;
    } else if (attr.type === 'ShorthandAttribute') {
      code += `${propsVar}[${JSON.stringify(attr.name)}] = ${attr.name};\n`;
    } else {
      code += processAttributeForProps(attr, propsVar, ctxVar);
    }
  }
  
  return { code, propsVar };
}

export function processEventAttribute(a: Attribute, ref: string, ctxVar: string): string {
  const info = isEventAttribute(a.name);
  if (!info.is || !info.event || !a.value || a.value.type !== 'Expr') return '';
  const handler = currentContext ? generateRegularEventHandler(a, currentContext, ctxVar) : '';
  return generateEventListenerRegistration(ref, info.event, handler);
}

export function processReactiveAttribute(a: Attribute, ref: string, ctxVar: string): string {
  if (a.value?.type !== 'Expr') return '';
  const simple = simpleVarFromExpr(a.value);
  if (simple && currentVarNames.includes(simple)) {
    const updater = uid('u');
    let code = `${ref}.${a.name} = String(${genExpr(a.value)});\n`;
    code += `const ${updater} = () => { ${ref}.${a.name} = String(${ctxVar}.${simple}); };\n`;
    code += `${ctxVar}.__subs[${JSON.stringify(simple)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(simple)}].push(${updater});\n`;
    return code;
  }
  return `${ref}.${a.name} = String(${genExpr(a.value)});\n`;
}

export function processRegularAttribute(a: Attribute, ref: string, ctxVar: string): string {
  const eventInfo = isEventAttribute(a.name);
  if (eventInfo.is && eventInfo.event) return processEventAttribute(a, ref, ctxVar);
  if (a.value == null) return `${ref}.setAttribute(${JSON.stringify(a.name)}, "");\n`;
  if (a.value.type === 'Text') {
    if (isSVGReadOnlyAttribute(a.name) || isSVGAttribute(a.name)) {
      return `${ref}.setAttribute(${JSON.stringify(a.name)}, ${JSON.stringify(a.value.value)});\n`;
    }
    return `${ref}.setAttribute(${JSON.stringify(a.name)}, ${JSON.stringify(a.value.value)});\n`;
  }
  if (a.value.type === 'Expr') {
    if (BOOLEAN_ATTRIBUTES.has(a.name)) return `${ref}.${a.name} = ${genExpr(a.value)};\n`;
    if (REACTIVE_INPUT_ATTRIBUTES.has(a.name)) return processReactiveAttribute(a, ref, ctxVar);
    if (isSVGReadOnlyAttribute(a.name) || isSVGAttribute(a.name)) {
      return `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${genExpr(a.value)}));\n`;
    }
    return `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${genExpr(a.value)}));\n`;
  }
  return '';
}

export function processShorthandAttribute(a: ShorthandAttribute, ref: string, ctxVar: string): string {
  // Check if this is an event attribute (starts with 'on')
  if (a.name.startsWith('on') && a.name.length > 2) {
    const handler = currentContext ? generateShorthandEventHandler(a, currentContext, ctxVar) : '';
    return `${ref}.addEventListener(${JSON.stringify(a.name.slice(2).toLowerCase())}, ${handler});\n`;
  }
  // For non-event shorthand attributes like {class}, treat as regular attribute
  // Use the mapped variable name if it exists (for reserved keywords like 'class' -> '_class')
  const varName = currentParamMapping[a.name] || a.name;
  return `${ref}.setAttribute(${JSON.stringify(a.name)}, String(${varName}));\n`;
}

export function processAttributeForElement(attr: any, ref: string, ctxVar: string): string {
  if ((attr as Attribute).type === 'Attribute') return processRegularAttribute(attr as Attribute, ref, ctxVar);
  if ((attr as ShorthandAttribute).type === 'ShorthandAttribute') return processShorthandAttribute(attr as ShorthandAttribute, ref, ctxVar);
  if ((attr as SpreadAttribute).type === 'SpreadAttribute') {
    const a = attr as SpreadAttribute;
    return `__rt.applyProps(${ref}, ${genExpr(a.argument)});\n`;
  }
  return '';
}

export function generateElementAttributes(el: Element, ref: string, ctxVar: string): string {
  if (el.attributes.length === 0) return '';
  
  // Check if this is an SVG element
  const isSVGElement = el.name.toLowerCase() === 'svg' || el.name.toLowerCase() === 'path' || el.name.toLowerCase() === 'circle' || el.name.toLowerCase() === 'rect' || el.name.toLowerCase() === 'line' || el.name.toLowerCase() === 'polygon' || el.name.toLowerCase() === 'polyline' || el.name.toLowerCase() === 'ellipse' || el.name.toLowerCase() === 'g' || el.name.toLowerCase() === 'defs' || el.name.toLowerCase() === 'use' || el.name.toLowerCase() === 'text' || el.name.toLowerCase() === 'tspan' || el.name.toLowerCase() === 'textPath' || el.name.toLowerCase() === 'image' || el.name.toLowerCase() === 'foreignObject';
  
  // Batch static attributes together
  const staticAttrs: Array<{name: string, value: string}> = [];
  let code = '';
  
  for (const attr of el.attributes) {
    if (attr.type === 'Attribute' && attr.value?.type === 'Text') {
      staticAttrs.push({ name: attr.name, value: attr.value.value });
    } else {
      code += processAttributeForElement(attr, ref, ctxVar);
    }
  }
  
  // For SVG elements, use individual setAttribute calls to avoid property conflicts
  if (staticAttrs.length > 0) {
    if (isSVGElement) {
      for (const {name, value} of staticAttrs) {
        code += `${ref}.setAttribute(${JSON.stringify(name)}, ${JSON.stringify(value)});\n`;
      }
    } else {
      // For regular HTML elements, batch attributes using applyProps
      const attrsObj = staticAttrs.reduce((acc, {name, value}) => {
        acc[name] = value;
        return acc;
      }, {} as Record<string, string>);
      code += `__rt.applyProps(${ref}, ${JSON.stringify(attrsObj)});\n`;
    }
  }
  
  return code;
}


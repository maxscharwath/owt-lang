/**
 * Code generation utilities for OWT compiler
 * Provides reusable functions for common code generation patterns
 */

import type { CompilerContext } from './context.js';
import { BOOLEAN_ATTRIBUTES, REACTIVE_INPUT_ATTRIBUTES } from './constants.js';

export interface EventHandlerOptions {
  context: CompilerContext;
  ctxVar: string;
  expression: string;
  isAssignment?: boolean;
  isLambdaAssignment?: boolean;
  isLambdaExpression?: boolean;
}

export interface ReactiveBindingOptions {
  context: CompilerContext;
  ctxVar: string;
  variableName: string;
  elementRef: string;
  attributeName: string;
}

/**
 * Generate a unique identifier with prefix
 */
export function generateId(context: CompilerContext, prefix: string): string {
  return `_${prefix}_${(context.idCounter++).toString(36)}`;
}

/**
 * Generate variable declarations for context variables
 */
export function generateVariableDeclarations(context: CompilerContext, ctxVar: string): string {
  return context.varNames.map(vn => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
}

/**
 * Generate change detection code
 */
export function generateChangeDetection(context: CompilerContext, ctxVar: string): string {
  const changeChecks = context.varNames.map(vn => 
    `if (${ctxVar}.${vn} !== __prev_${vn}) __changed.push(${JSON.stringify(vn)});`
  ).join(' ');
  return `const __changed = []; ${changeChecks}`;
}

/**
 * Generate reactive notification code
 */
export function generateNotificationCode(ctxVar: string): string {
  return `if (__changed.length) ${ctxVar}.__notify(__changed);`;
}

/**
 * Generate event handler code
 */
export function generateEventHandler(options: EventHandlerOptions): string {
  const { context, ctxVar, expression, isAssignment, isLambdaAssignment, isLambdaExpression } = options;
  
  const varDecls = generateVariableDeclarations(context, ctxVar);
  const changeDetection = generateChangeDetection(context, ctxVar);
  const notification = generateNotificationCode(ctxVar);
  
  if (isAssignment) {
    // Direct assignment: variable = value
    return `($event) => { ${varDecls} ${changeDetection} ${expression}; ${notification} }`;
  }
  
  if (isLambdaAssignment || isLambdaExpression) {
    // Lambda expression: (e) => expression
    return `($event) => { ${varDecls} ${changeDetection} (${expression})($event); ${notification} }`;
  }
  
  // Function call: functionName
  return `($event) => { ${varDecls} const __h = (${expression}); ${changeDetection} if (typeof __h === 'function') __h($event); ${notification} }`;
}

/**
 * Generate reactive binding for input elements
 */
export function generateReactiveBinding(options: ReactiveBindingOptions): string {
  const { context, ctxVar, variableName, elementRef, attributeName } = options;
  
  const updaterId = generateId(context, 'u');
  const propertyName = attributeName === 'value' ? 'value' : 'textContent';
  
  let code = `${elementRef}.setAttribute(${JSON.stringify(attributeName)}, String(${ctxVar}.${variableName}));\n`;
  code += `const ${updaterId} = () => { ${elementRef}.${propertyName} = String(${ctxVar}.${variableName}); };\n`;
  code += `${ctxVar}.__subs[${JSON.stringify(variableName)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(variableName)}].push(${updaterId});\n`;
  
  return code;
}

/**
 * Generate reactive text node
 */
export function generateReactiveTextNode(
  context: CompilerContext, 
  ctxVar: string, 
  variableName: string, 
  elementRef: string
): string {
  const textNodeId = generateId(context, 'tn');
  const updaterId = generateId(context, 'u');
  
  let code = `const ${textNodeId} = document.createTextNode(String(${ctxVar}.${variableName}));\n`;
  code += `${elementRef}.appendChild(${textNodeId});\n`;
  code += `const ${updaterId} = () => { ${textNodeId}.data = String(${ctxVar}.${variableName}); };\n`;
  code += `${ctxVar}.__subs[${JSON.stringify(variableName)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(variableName)}].push(${updaterId});\n`;
  
  return code;
}

/**
 * Generate val text node (computed values)
 */
export function generateValTextNode(
  context: CompilerContext,
  ctxVar: string,
  variableName: string,
  elementRef: string
): string {
  const initExpr = context.valInits[variableName];
  const deps = context.valDeps[variableName] || [];
  const textNodeId = generateId(context, 'tn');
  const updaterId = generateId(context, 'u');
  
  const varDecls = generateVariableDeclarations(context, ctxVar);
  
  let code = `const ${textNodeId} = document.createTextNode(String((() => { const props = ${ctxVar}.props; ${varDecls} return ${initExpr}; })()));\n`;
  code += `${elementRef}.appendChild(${textNodeId});\n`;
  code += `const ${updaterId} = () => { const props = ${ctxVar}.props; ${varDecls} ${textNodeId}.data = String(${initExpr}); };\n`;
  
  for (const dep of deps) {
    code += `${ctxVar}.__subs[${JSON.stringify(dep)}] ||= []; ${ctxVar}.__subs[${JSON.stringify(dep)}].push(${updaterId});\n`;
  }
  
  return code;
}

/**
 * Check if an attribute is a boolean attribute
 */
export function isBooleanAttribute(name: string): boolean {
  return BOOLEAN_ATTRIBUTES.has(name);
}

/**
 * Check if an attribute supports reactive binding
 */
export function isReactiveAttribute(name: string): boolean {
  return REACTIVE_INPUT_ATTRIBUTES.has(name);
}

/**
 * Generate boolean attribute code
 */
export function generateBooleanAttribute(elementRef: string, name: string, expression: string): string {
  return `if (${expression}) { ${elementRef}.setAttribute(${JSON.stringify(name)}, ""); } else { ${elementRef}.removeAttribute(${JSON.stringify(name)}); }\n`;
}

/**
 * Generate regular attribute code
 */
export function generateRegularAttribute(elementRef: string, name: string, expression: string): string {
  return `${elementRef}.setAttribute(${JSON.stringify(name)}, String(${expression}));\n`;
}

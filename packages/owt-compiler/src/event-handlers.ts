/**
 * Event handling utilities for OWT compiler
 */

import type { Attribute, ShorthandAttribute, Expr } from '@owt/ast';
import type { CompilerContext } from './context.js';
import { generateEventHandler, generateId } from './codegen-utils.js';
import { 
  isAssignmentExpression, 
  isLambdaAssignmentExpression, 
  isLambdaExpressionOnly,
  isSimpleVariableExpression 
} from './expression-parser.js';

export interface EventAttributeInfo {
  isEvent: boolean;
  eventName?: string;
}

/**
 * Check if an attribute is an event attribute
 */
export function isEventAttribute(name: string): EventAttributeInfo {
  if (name.startsWith('on') && name.length > 2) {
    const eventName = name.slice(2).toLowerCase();
    return { isEvent: true, eventName };
  }
  return { isEvent: false };
}

/**
 * Generate event handler for regular attributes
 */
export function generateRegularEventHandler(
  attr: Attribute, 
  context: CompilerContext, 
  ctxVar: string
): string {
  if (!attr.value || attr.value.type !== 'Expr') {
    return '';
  }
  
  const expression = attr.value.code;
  const isAssignment = isAssignmentExpression(expression);
  const isLambdaAssignment = isLambdaAssignmentExpression(expression);
  const isLambdaExpression = isLambdaExpressionOnly(expression);
  
  return generateEventHandler({
    context,
    ctxVar,
    expression,
    isAssignment,
    isLambdaAssignment,
    isLambdaExpression
  });
}

/**
 * Generate event handler for shorthand attributes
 */
export function generateShorthandEventHandler(
  attr: ShorthandAttribute,
  context: CompilerContext,
  ctxVar: string
): string {
  const varDecls = context.varNames.map(vn => `let ${vn} = ${ctxVar}.${vn};`).join(' ');
  const changeDetection = context.varNames.map(vn => 
    `const __prev_${vn} = ${ctxVar}.${vn};`
  ).join(' ') + ' ' + context.varNames.map(vn => 
    `if (${ctxVar}.${vn} !== __prev_${vn}) __changed.push(${JSON.stringify(vn)});`
  ).join(' ');
  const notification = `if (__changed.length) ${ctxVar}.__notify(__changed);`;
  
  return `($event) => { const __changed = []; ${varDecls} ${changeDetection} ${attr.name}($event); ${notification} }`;
}

/**
 * Generate event listener registration code
 */
export function generateEventListenerRegistration(
  elementRef: string,
  eventName: string,
  handlerCode: string
): string {
  return `${elementRef}.addEventListener(${JSON.stringify(eventName)}, ${handlerCode});\n`;
}

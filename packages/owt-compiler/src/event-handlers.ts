/**
 * Event handling utilities for OWT compiler
 */

import type { Attribute, ShorthandAttribute } from '@owt/ast';
import type { CompilerContext } from './context';
import { generateEventHandler } from './codegen-utils';
import { 
  isAssignmentExpression, 
  isLambdaAssignmentExpression, 
  isLambdaExpressionOnly
} from './expression-parser';

export interface EventAttributeInfo {
  is: boolean;
  event?: string;
}

/**
 * Check if an attribute is an event attribute
 */
export function isEventAttribute(name: string): EventAttributeInfo {
  if (name.startsWith('on') && name.length > 2) {
    const event = name.slice(2).toLowerCase();
    return { is: true, event };
  }
  return { is: false };
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

  // Enforce guideline: event handlers must be function ref or lambda expression
  // If it's not an assignment nor a lambda, treat as function reference; otherwise allowed.
  
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
  // Wrap shorthand name call using the same unified handler generator
  // by synthesizing an expression that represents calling the function
  // Users pass {onClick} etc.; we generate handler that resolves from scope
  const expression = `${attr.name}`;
  const isAssignment = false;
  const isLambdaAssignment = false;
  const isLambdaExpression = false;
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
 * Generate event listener registration code
 */
export function generateEventListenerRegistration(
  elementRef: string,
  eventName: string,
  handlerCode: string
): string {
  return `${elementRef}.addEventListener(${JSON.stringify(eventName)}, ${handlerCode});\n`;
}

/**
 * Robust expression parsing utilities for OWT compiler
 */

import { COMPARISON_OPERATORS } from './constants';

export type ExpressionType = 
  | 'assignment'
  | 'lambda-assignment' 
  | 'lambda-expression'
  | 'function-call'
  | 'comparison'
  | 'unknown';

export interface ExpressionInfo {
  type: ExpressionType;
  hasAssignment: boolean;
  hasLambda: boolean;
  hasComparison: boolean;
  isSimpleVariable: boolean;
  variableName?: string;
}

/**
 * Robust expression type detection using proper parsing
 */
export function analyzeExpression(code: string): ExpressionInfo {
  const trimmed = code.trim();
  
  // Check for simple variable reference
  const simpleVar = extractSimpleVariable(trimmed);
  if (simpleVar) {
    return {
      type: 'function-call',
      hasAssignment: false,
      hasLambda: false,
      hasComparison: false,
      isSimpleVariable: true,
      variableName: simpleVar
    };
  }
  
  // Check for lambda expressions
  const hasLambda = containsLambda(trimmed);
  // Comparison must be detected before assignment to avoid '===' being
  // misclassified as assignment due to '=' presence.
  const hasComparison = containsComparison(trimmed);
  const hasAssignment = hasLambda
    ? containsLambdaAssignment(trimmed)
    : (!hasComparison && containsAssignment(trimmed));
  
  if (hasLambda && hasAssignment) {
    return {
      type: 'lambda-assignment',
      hasAssignment: true,
      hasLambda: true,
      hasComparison,
      isSimpleVariable: false
    };
  }
  
  if (hasLambda) {
    return {
      type: 'lambda-expression',
      hasAssignment: false,
      hasLambda: true,
      hasComparison,
      isSimpleVariable: false
    };
  }
  
  if (hasAssignment) {
    return {
      type: 'assignment',
      hasAssignment: true,
      hasLambda: false,
      hasComparison,
      isSimpleVariable: false
    };
  }
  
  if (hasComparison) {
    return {
      type: 'comparison',
      hasAssignment: false,
      hasLambda: false,
      hasComparison: true,
      isSimpleVariable: false
    };
  }
  
  return {
    type: 'function-call',
    hasAssignment: false,
    hasLambda: false,
    hasComparison: false,
    isSimpleVariable: false
  };
}

/**
 * Extract simple variable name from expression if it's just a variable reference
 */
function extractSimpleVariable(code: string): string | null {
  // Match simple variable: starts with letter/underscore, followed by word chars
  const regex = /^[A-Za-z_$][\w$]*$/;
  const match = regex.exec(code);
  return match ? match[0] : null;
}

/**
 * Check if expression contains a lambda (arrow function)
 */
function containsLambda(code: string): boolean {
  // Look for arrow function pattern: (params) => or param =>
  return /\([^)]*\)\s*=>|^\w+\s*=>/.test(code);
}

/**
 * Check if expression contains assignment operators
 */
function containsAssignment(code: string): boolean {
  // Check for assignment with proper spacing to avoid false positives
  return /\s=\s/.test(code) || /\s=/.test(code) || /^[A-Za-z_$][\w$]*\s*=$/.test(code);
}

/**
 * Detect assignment inside a lambda body
 */
function containsLambdaAssignment(code: string): boolean {
  // Extract lambda body after => and check for '=' that is not part of '=='/'>='/'<='/'===' etc.
  const m = code.match(/=>\s*([\s\S]+)/);
  if (!m) return false;
  const body = m[1].trim();
  // Remove braces if present
  const inner = body.startsWith('{') && body.endsWith('}') ? body.slice(1, -1) : body;
  // Quick check: has single '=' not followed/preceded by '='
  return /(\b|\s)=[^=]/.test(inner);
}

/**
 * Check if expression contains comparison operators
 */
function containsComparison(code: string): boolean {
  for (const op of COMPARISON_OPERATORS) {
    if (code.includes(op)) return true;
  }
  return false;
}

/**
 * Check if expression is a simple assignment (not comparison or lambda)
 */
export function isAssignmentExpression(code: string): boolean {
  const info = analyzeExpression(code);
  return info.type === 'assignment';
}

/**
 * Check if expression is a lambda with assignment
 */
export function isLambdaAssignmentExpression(code: string): boolean {
  const info = analyzeExpression(code);
  return info.type === 'lambda-assignment';
}

/**
 * Check if expression is a lambda without assignment
 */
export function isLambdaExpressionOnly(code: string): boolean {
  const info = analyzeExpression(code);
  return info.type === 'lambda-expression';
}

/**
 * Check if expression is a simple function call
 */
export function isFunctionCallExpression(code: string): boolean {
  const info = analyzeExpression(code);
  return info.type === 'function-call' && !info.isSimpleVariable;
}

/**
 * Check if expression is a simple variable reference
 */
export function isSimpleVariableExpression(code: string): boolean {
  const info = analyzeExpression(code);
  return info.isSimpleVariable;
}

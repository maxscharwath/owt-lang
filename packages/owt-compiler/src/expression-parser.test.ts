/**
 * Tests for expression parser utilities
 */

import { 
  analyzeExpression,
  isAssignmentExpression,
  isLambdaAssignmentExpression,
  isLambdaExpressionOnly,
  isFunctionCallExpression,
  isSimpleVariableExpression
} from './expression-parser.js';

describe('Expression Parser', () => {
  describe('analyzeExpression', () => {
    test('should detect simple variable references', () => {
      const result = analyzeExpression('addTodo');
      expect(result.type).toBe('function-call');
      expect(result.isSimpleVariable).toBe(true);
      expect(result.variableName).toBe('addTodo');
    });

    test('should detect assignment expressions', () => {
      const result = analyzeExpression('newTodoText = e.target.value');
      expect(result.type).toBe('assignment');
      expect(result.hasAssignment).toBe(true);
      expect(result.hasLambda).toBe(false);
    });

    test('should detect lambda assignment expressions', () => {
      const result = analyzeExpression('(e) => newTodoText = e.target.value');
      expect(result.type).toBe('lambda-assignment');
      expect(result.hasAssignment).toBe(true);
      expect(result.hasLambda).toBe(true);
    });

    test('should detect lambda expressions', () => {
      const result = analyzeExpression('(e) => e.key === "Enter" && addTodo()');
      expect(result.type).toBe('lambda-expression');
      expect(result.hasAssignment).toBe(false);
      expect(result.hasLambda).toBe(true);
    });

    test('should detect comparison expressions', () => {
      const result = analyzeExpression('e.target.value === "test"');
      expect(result.type).toBe('comparison');
      expect(result.hasComparison).toBe(true);
      expect(result.hasAssignment).toBe(false);
    });

    test('should handle complex expressions', () => {
      const result = analyzeExpression('(e) => e.key === "Enter" && e.target.value.trim() !== ""');
      expect(result.type).toBe('lambda-expression');
      expect(result.hasLambda).toBe(true);
      expect(result.hasComparison).toBe(true);
    });
  });

  describe('isAssignmentExpression', () => {
    test('should return true for simple assignments', () => {
      expect(isAssignmentExpression('newTodoText = e.target.value')).toBe(true);
      expect(isAssignmentExpression('count = 0')).toBe(true);
    });

    test('should return false for comparisons', () => {
      expect(isAssignmentExpression('a === b')).toBe(false);
      expect(isAssignmentExpression('x != y')).toBe(false);
    });

    test('should return false for lambda expressions', () => {
      expect(isAssignmentExpression('(e) => e.target.value')).toBe(false);
    });
  });

  describe('isLambdaAssignmentExpression', () => {
    test('should return true for lambda assignments', () => {
      expect(isLambdaAssignmentExpression('(e) => newTodoText = e.target.value')).toBe(true);
      expect(isLambdaAssignmentExpression('(x) => count = x + 1')).toBe(true);
    });

    test('should return false for regular assignments', () => {
      expect(isLambdaAssignmentExpression('newTodoText = e.target.value')).toBe(false);
    });

    test('should return false for lambda expressions without assignment', () => {
      expect(isLambdaAssignmentExpression('(e) => e.key === "Enter"')).toBe(false);
    });
  });

  describe('isLambdaExpressionOnly', () => {
    test('should return true for lambda expressions', () => {
      expect(isLambdaExpressionOnly('(e) => e.key === "Enter" && addTodo()')).toBe(true);
      expect(isLambdaExpressionOnly('() => toggleTodo(todo.id)')).toBe(true);
    });

    test('should return false for lambda assignments', () => {
      expect(isLambdaExpressionOnly('(e) => newTodoText = e.target.value')).toBe(false);
    });

    test('should return false for regular expressions', () => {
      expect(isLambdaExpressionOnly('addTodo()')).toBe(false);
    });
  });

  describe('isSimpleVariableExpression', () => {
    test('should return true for simple variables', () => {
      expect(isSimpleVariableExpression('addTodo')).toBe(true);
      expect(isSimpleVariableExpression('_privateVar')).toBe(true);
      expect(isSimpleVariableExpression('$jquery')).toBe(true);
    });

    test('should return false for complex expressions', () => {
      expect(isSimpleVariableExpression('addTodo()')).toBe(false);
      expect(isSimpleVariableExpression('a + b')).toBe(false);
    });
  });
});

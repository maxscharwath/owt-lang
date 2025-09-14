import { describe, test, expect } from 'vitest';
import {
  analyzeExpression,
  isAssignmentExpression,
  isLambdaAssignmentExpression,
  isLambdaExpressionOnly,
  isSimpleVariableExpression,
} from './expression-parser';

describe('Expression Parser', () => {
  describe('analyzeExpression', () => {
    test('should detect simple variable references', () => {
      const code = 'addTodo';

      const result = analyzeExpression(code);

      expect(result.type).toBe('function-call');
      expect(result.isSimpleVariable).toBe(true);
      expect(result.variableName).toBe('addTodo');
    });

    test('should detect assignment expressions', () => {
      const code = 'newTodoText = e.target.value';

      const result = analyzeExpression(code);

      expect(result.type).toBe('assignment');
      expect(result.hasAssignment).toBe(true);
      expect(result.hasLambda).toBe(false);
    });

    test('should detect lambda assignment expressions', () => {
      const code = '(e) => newTodoText = e.target.value';

      const result = analyzeExpression(code);

      expect(result.type).toBe('lambda-assignment');
      expect(result.hasAssignment).toBe(true);
      expect(result.hasLambda).toBe(true);
    });

    test('should detect lambda expressions', () => {
      const code = '(e) => e.key === "Enter" && addTodo()';

      const result = analyzeExpression(code);

      expect(result.type).toBe('lambda-expression');
      expect(result.hasAssignment).toBe(false);
      expect(result.hasLambda).toBe(true);
    });

    test('should detect comparison expressions', () => {
      const code = 'e.target.value === "test"';

      const result = analyzeExpression(code);

      expect(result.type).toBe('comparison');
      expect(result.hasComparison).toBe(true);
      expect(result.hasAssignment).toBe(false);
    });

    test('should handle complex expressions', () => {
      const code = '(e) => e.key === "Enter" && e.target.value.trim() !== ""';

      const result = analyzeExpression(code);

      expect(result.type).toBe('lambda-expression');
      expect(result.hasLambda).toBe(true);
      expect(result.hasComparison).toBe(true);
    });
  });

  describe('isAssignmentExpression', () => {
    test('returns true for simple assignment with property access', () => {
      const code = 'newTodoText = e.target.value';

      const value = isAssignmentExpression(code);

      expect(value).toBe(true);
    });

    test('returns true for simple assignment with literal', () => {
      const code = 'count = 0';

      const value = isAssignmentExpression(code);

      expect(value).toBe(true);
    });

    test('returns false for strict equality comparison', () => {
      const code = 'a === b';

      const value = isAssignmentExpression(code);

      expect(value).toBe(false);
    });

    test('returns false for inequality comparison', () => {
      const code = 'x != y';

      const value = isAssignmentExpression(code);

      expect(value).toBe(false);
    });

    test('should return false for lambda expressions', () => {
      const code = '(e) => e.target.value';

      const value = isAssignmentExpression(code);

      expect(value).toBe(false);
    });
  });

  describe('isLambdaAssignmentExpression', () => {
    test('returns true for lambda assignment with event param', () => {
      const code = '(e) => newTodoText = e.target.value';

      const value = isLambdaAssignmentExpression(code);

      expect(value).toBe(true);
    });

    test('returns true for lambda assignment with arithmetic', () => {
      const code = '(x) => count = x + 1';

      const value = isLambdaAssignmentExpression(code);

      expect(value).toBe(true);
    });

    test('should return false for regular assignments', () => {
      const code = 'newTodoText = e.target.value';

      const value = isLambdaAssignmentExpression(code);

      expect(value).toBe(false);
    });

    test('should return false for lambda expressions without assignment', () => {
      const code = '(e) => e.key === "Enter"';

      const value = isLambdaAssignmentExpression(code);

      expect(value).toBe(false);
    });
  });

  describe('isLambdaExpressionOnly', () => {
    test('returns true for lambda expression with comparison and call', () => {
      const code = '(e) => e.key === "Enter" && addTodo()';

      const value = isLambdaExpressionOnly(code);

      expect(value).toBe(true);
    });

    test('returns true for lambda expression with call', () => {
      const code = '() => toggleTodo(todo.id)';

      const value = isLambdaExpressionOnly(code);

      expect(value).toBe(true);
    });

    test('should return false for lambda assignments', () => {
      const code = '(e) => newTodoText = e.target.value';

      const value = isLambdaExpressionOnly(code);

      expect(value).toBe(false);
    });

    test('should return false for regular expressions', () => {
      const code = 'addTodo()';

      const value = isLambdaExpressionOnly(code);

      expect(value).toBe(false);
    });
  });

  describe('isSimpleVariableExpression', () => {
    test('returns true for simple variable', () => {
      const code = 'addTodo';

      const value = isSimpleVariableExpression(code);

      expect(value).toBe(true);
    });

    test('returns true for simple underscore variable', () => {
      const code = '_privateVar';

      const value = isSimpleVariableExpression(code);

      expect(value).toBe(true);
    });

    test('returns true for simple dollar variable', () => {
      const code = '$jquery';

      const value = isSimpleVariableExpression(code);

      expect(value).toBe(true);
    });

    test('returns false for function call', () => {
      const code = 'addTodo()';

      const value = isSimpleVariableExpression(code);

      expect(value).toBe(false);
    });

    test('returns false for operator expression', () => {
      const code = 'a + b';

      const value = isSimpleVariableExpression(code);

      expect(value).toBe(false);
    });
  });
});

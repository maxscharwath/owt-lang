/**
 * Constants used throughout the OWT compiler
 */

// HTML boolean attributes that should be handled specially
export const BOOLEAN_ATTRIBUTES = new Set([
  'checked',
  'disabled', 
  'selected',
  'readonly',
  'required',
  'autofocus',
  'multiple',
  'hidden',
  'defer',
  'async',
  'autoplay',
  'controls',
  'loop',
  'muted',
  'preload',
  'reversed',
  'scoped',
  'seamless',
  'sortable',
  'truespeed'
]);

// HTML attributes that support reactive binding for input elements
export const REACTIVE_INPUT_ATTRIBUTES = new Set([
  'value',
  'textContent'
]);

// Common event names that should be normalized to lowercase
export const EVENT_NAMES = new Set([
  'click',
  'change',
  'input',
  'keydown',
  'keyup',
  'keypress',
  'focus',
  'blur',
  'submit',
  'reset',
  'select',
  'load',
  'unload',
  'resize',
  'scroll',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'mouseenter',
  'mouseleave',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel'
]);

// JavaScript comparison operators that should not be treated as assignments
export const COMPARISON_OPERATORS = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '>',
  '<=',
  '>='
]);

// JavaScript assignment operators
export const ASSIGNMENT_OPERATORS = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '^=',
  '|=',
  '&&=',
  '||=',
  '??='
]);
